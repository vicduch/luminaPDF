import React, { useEffect, useState } from 'react';
import { getRecentFiles as getLocalRecents, deleteRecentFile, RecentFileMetadata, getFileBlob } from '../services/storage';
import {
    signInWithGoogle,
    signOut,
    getUser,
    getRecentFiles as getCloudRecents,
    upsertRecentFile,
    isSupabaseconfigured
} from '../services/supabase';
import { openDrivePicker, downloadDriveFile } from '../services/drive';
import { FileText, Clock, Trash2, HardDrive, LogIn, LogOut, Cloud, User } from './Icons';
import { AppTheme } from '../types';

interface RecentFilesProps {
    onFileSelect: (file: File) => void;
    theme: AppTheme;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const RecentFiles: React.FC<RecentFilesProps> = ({ onFileSelect, theme }) => {
    const [files, setFiles] = useState<RecentFileMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [isCloudEnabled, setIsCloudEnabled] = useState(false);

    // Theme helpers
    const isDark = theme !== AppTheme.LIGHT && theme !== AppTheme.SEPIA && theme !== AppTheme.SOLARIZED;
    const cardBg = isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10';
    const textPrimary = isDark ? 'text-gray-200' : 'text-gray-800';
    const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';

    useEffect(() => {
        setIsCloudEnabled(isSupabaseconfigured());
        checkUser();
        loadFiles();

        // Listen for auth state changes if needed, but for now simple check on mount
    }, []);

    const checkUser = async () => {
        if (!isSupabaseconfigured()) return;
        const u = await getUser();
        setUser(u);
    };

    const loadFiles = async () => {
        setLoading(true);
        try {
            // 1. Load Local Files
            const local = await getLocalRecents();

            // 2. Load Cloud Files if logged in
            let cloudFiles: RecentFileMetadata[] = [];
            if (user) {
                const cloud = await getCloudRecents();
                cloudFiles = cloud.map(c => ({
                    id: c.id || '',
                    name: c.name,
                    size: c.metadata?.size || 0,
                    type: c.metadata?.type || 'application/pdf',
                    lastVisited: c.last_viewed ? new Date(c.last_viewed).getTime() : Date.now(),
                    pageNumber: c.metadata?.pageNumber || 1,
                    annotations: c.metadata?.annotations || [],
                    source: c.source
                }));
            }

            // 3. Merge (Simple overwrite by ID or concat? For now, concat distinct)
            // Ideally we deduplicate by ID.
            const allFiles = [...local];
            cloudFiles.forEach(cf => {
                if (!allFiles.find(f => f.id === cf.id)) {
                    allFiles.push(cf);
                }
            });

            // Sort by date
            allFiles.sort((a, b) => b.lastVisited - a.lastVisited);

            setFiles(allFiles);
        } catch (error) {
            console.error("Failed to load recent files:", error);
        } finally {
            setLoading(false);
        }
    };

    // Re-load files when user changes
    useEffect(() => {
        loadFiles();
    }, [user]);

    const handleLogin = async () => {
        try {
            await signInWithGoogle();
            // Redirect happens, so execution might stop here
        } catch (error) {
            console.error("Login failed:", error);
        }
    };

    const handleLogout = async () => {
        await signOut();
        setUser(null);
        setFiles([]); // Clear mix, reload local only handled by effect
    };

    const handleDriveOpen = async () => {
        // Si l'utilisateur n'est pas connecté, rediriger vers la connexion Google
        if (!user) {
            try {
                await signInWithGoogle();
                // La page va se recharger après le login, donc on s'arrête ici
                return;
            } catch (error) {
                console.error("Erreur de connexion:", error);
                alert("Veuillez d'abord vous connecter pour accéder à Google Drive.");
                return;
            }
        }

        try {
            console.log("Tentative d'ouverture de Google Drive...");
            const driveFile = await openDrivePicker();

            if (driveFile) {
                console.log("Fichier sélectionné:", driveFile.name);
                // Download content
                const blob = await downloadDriveFile(driveFile);
                const file = new File([blob], driveFile.name, { type: driveFile.mimeType });

                onFileSelect(file);

                if (user) {
                    await upsertRecentFile({
                        name: driveFile.name,
                        source: 'drive',
                        last_viewed: new Date().toISOString(),
                        metadata: {
                            size: blob.size,
                            type: driveFile.mimeType,
                            driveId: driveFile.id
                        }
                    });
                }
            }
        } catch (error: any) {
            console.error("Détails de l'erreur Drive:", error);

            let message = "Impossible d'ouvrir Google Drive.";
            if (error?.error === "idpiframe_initialization_failed") {
                message += "\n\nVérifiez que les COOKIES TIERS sont autorisés dans votre navigateur et que l'Origine JavaScript est bien https://luminapdf.vercel.app dans Google Cloud.";
            } else if (error?.details) {
                message += "\nDétails : " + error.details;
            } else if (error?.message) {
                message += "\n" + error.message;
            } else {
                message += "\nConsultez la console (F12) pour plus de détails.";
            }

            alert(message);
        }
    };

    const handleOpen = async (fileMeta: RecentFileMetadata) => {
        try {
            // Check source
            if ((fileMeta as any).source === 'drive') {
                // It's a drive file reference. We need to fetch it.
                // We need the Drive ID.
                // currently we don't have it easily without storing it.
                // Assuming we stored it in metadata.
                // For MVP, if we can't find blob locally, maybe tell user to re-open from Drive?
                // Or try to download if we had the ID.
                alert("Pour réouvrir un fichier Drive, veuillez utiliser le bouton 'Google Drive'. (Persistance Drive WIP)");
                return;
            }

            // Default: Try Local IndexedDB
            const blob = await getFileBlob(fileMeta.id);
            if (blob) {
                const file = new File([blob], fileMeta.name, { type: blob.type || fileMeta.type });
                onFileSelect(file);
            } else {
                console.error("File blob not found locally");
                // If it was supposed to be local, it's missing.
                // If it was cloud, maybe we need to fetch from URL?
                if ((fileMeta as any).url) {
                    // Fetch from URL
                }
            }
        } catch (e) {
            console.error("Failed to open file", e);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await deleteRecentFile(id); // Local delete
            // Cloud delete? Not implemented in UI yet
            setFiles(prev => prev.filter(f => f.id !== id));
        } catch (error) {
            console.error("Failed to delete file", error);
        }
    };

    const getThemeIconColor = () => {
        switch (theme) {
            case AppTheme.FOREST: return isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700';
            case AppTheme.SEPIA:
            case AppTheme.SOLARIZED: return isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-orange-100 text-orange-800';
            case AppTheme.MIDNIGHT:
            case AppTheme.DARK:
            case AppTheme.BLUE_NIGHT: return 'bg-blue-600/30 text-blue-300';
            default: return 'bg-blue-100 text-blue-600';
        }
    };

    if (loading) return <div className="p-10 text-center opacity-50 flex flex-col items-center gap-2"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>Chargement...</div>;

    return (
        <div className="max-w-5xl mx-auto p-6 animate-fade-in">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h2 className={`text-2xl font-light flex items-center gap-2 ${textPrimary}`}>
                    <Clock size={24} className="opacity-70" />
                    Tableau de bord
                </h2>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDriveOpen}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                            bg-white dark:bg-zinc-800 shadow-sm border border-gray-200 dark:border-zinc-700
                            hover:bg-gray-50 dark:hover:bg-zinc-700/80 ${textPrimary}
                        `}
                    >
                        <HardDrive size={18} />
                        Google Drive
                    </button>

                    {isCloudEnabled && (
                        !user ? (
                            <button
                                onClick={handleLogin}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all"
                            >
                                <LogIn size={18} />
                                Connexion
                            </button>
                        ) : (
                            <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                    {user.email?.charAt(0).toUpperCase()}
                                </div>
                                <div className="hidden sm:block text-sm">
                                    <p className={textPrimary}>{user.email}</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-500 transition-colors"
                                    title="Déconnexion"
                                >
                                    <LogOut size={16} />
                                </button>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Empty State */}
            {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 mt-4 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl opacity-60">
                    <Cloud size={64} className="mb-4 opacity-50" />
                    <h3 className={`text-xl font-medium ${textPrimary}`}>Aucun document récent</h3>
                    <p className={`mt-2 ${textSecondary}`}>
                        Ouvrez un fichier local ou depuis Google Drive pour commencer
                    </p>
                    <label className="mt-6 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95 font-medium flex items-center gap-2">
                        <FileText size={20} />
                        Ouvrir un PDF local
                        <input type="file" accept="application/pdf" onChange={(e) => {
                            if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
                        }} className="hidden" />
                    </label>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map(file => {
                        const isDrive = (file as any).source === 'drive';
                        return (
                            <div
                                key={file.id}
                                onClick={() => handleOpen(file)}
                                className={`
                                    group relative p-4 rounded-xl border border-transparent transition-all cursor-pointer
                                    ${cardBg}
                                    hover:shadow-md hover:border-black/5 dark:hover:border-white/10
                                `}
                            >
                                <div className="flex items-start justify-between">
                                    <div className={`p-3 rounded-lg ${getThemeIconColor()}`}>
                                        {isDrive ? <HardDrive size={24} /> : <FileText size={24} />}
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(e, file.id)}
                                        className="opacity-0 group-hover:opacity-100 p-2 rounded-full hover:bg-red-500/20 hover:text-red-500 transition-all text-gray-400"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="mt-4">
                                    <h3 className={`font-medium truncate ${textPrimary}`} title={file.name}>
                                        {file.name}
                                    </h3>
                                    <div className={`flex items-center gap-3 mt-2 text-xs font-mono uppercase tracking-wide ${textSecondary}`}>
                                        <span>{formatBytes(file.size)}</span>
                                        <span>•</span>
                                        <span>{isDrive ? 'DRIVE' : 'LOCAL'}</span>
                                    </div>
                                    <div className={`mt-4 text-xs ${textSecondary} flex justify-between items-end`}>
                                        <span>{formatDate(file.lastVisited)}</span>
                                        {file.annotations && file.annotations.length > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 font-medium">
                                                {file.annotations.length} note{file.annotations.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RecentFiles;

