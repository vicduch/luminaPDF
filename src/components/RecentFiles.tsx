import React, { useEffect, useState } from 'react';
import { getRecentFiles as getLocalRecents, deleteRecentFile, RecentFileMetadata, getFileBlob } from '../services/storage';
import {
    signInWithGoogle,
    signOut,
    getUser,
    getRecentFiles as getCloudRecents,
    upsertRecentFile,
    isSupabaseconfigured,
    onAuthStateChange
} from '../services/supabase';
import { openDrivePicker, downloadDriveFile } from '../services/drive';
import { FileText, Clock, Trash2, HardDrive, LogIn, LogOut, Cloud, User, GoogleDriveIcon } from './Icons';
import { AppTheme } from '../types';

interface RecentFilesProps {
    onFileSelect: (file: File) => void;
    theme: AppTheme;
}

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

        // Initial check
        checkUser();
        loadFiles();

        // Listen for auth state changes
        const unsubscribe = onAuthStateChange((u) => {
            setUser(u);
        });

        return () => unsubscribe();
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

    const [isDriving, setIsDriving] = useState(false);

    const handleDriveOpen = async () => {
        if (isDriving) return;

        try {
            setIsDriving(true);
            console.log("Tentative d'ouverture de Google Drive...");
            const driveFile = await openDrivePicker();

            if (driveFile) {
                console.log("Fichier sélectionné:", driveFile.name);
                const blob = await downloadDriveFile(driveFile);
                const file = new File([blob], driveFile.name, { type: driveFile.mimeType });

                onFileSelect(file);

                // We only sync to cloud if the user is actually logged in
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
        } finally {
            setIsDriving(false);
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
                            <>
                                <button
                                    onClick={handleDriveOpen}
                                    disabled={isDriving}
                                    className={`
                                        flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                                        bg-white dark:bg-zinc-800 shadow-sm border border-gray-200 dark:border-zinc-700
                                        hover:bg-gray-50 dark:hover:bg-zinc-700/80 ${textPrimary}
                                        ${isDriving ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {isDriving ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                                    ) : (
                                        <GoogleDriveIcon size={18} />
                                    )}
                                    Google Drive
                                </button>

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
                            </>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {files.map(file => {
                        return (
                            <div
                                key={file.id}
                                onClick={() => handleOpen(file)}
                                className={`
                                    group relative flex flex-col items-center p-4 rounded-2xl transition-all cursor-pointer
                                    ${cardBg} active:scale-95
                                    hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)]
                                `}
                            >
                                {/* Delete button - Absolute top right */}
                                <button
                                    onClick={(e) => handleDelete(e, file.id)}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-500/10 text-red-500 transition-all z-10"
                                    title="Supprimer"
                                >
                                    <Trash2 size={14} />
                                </button>

                                {/* Cover / Thumbnail */}
                                {file.thumbnail ? (
                                    <div className="w-24 h-32 mb-3 rounded-lg overflow-hidden shadow-md transition-transform group-hover:scale-105 border border-black/5 dark:border-white/10">
                                        <img
                                            src={file.thumbnail}
                                            alt={file.name}
                                            className="w-full h-full object-cover"
                                            draggable={false}
                                        />
                                    </div>
                                ) : (
                                    <div className={`
                                        w-24 h-32 mb-3 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105
                                        bg-gradient-to-br from-red-500/10 to-red-600/5 dark:from-red-500/20 dark:to-red-600/10
                                        border border-red-500/10 dark:border-red-500/20 shadow-sm
                                    `}>
                                        <FileText size={40} className="text-red-500 opacity-80" />
                                    </div>
                                )}

                                {/* File Name */}
                                <div className="w-full text-center">
                                    <h3
                                        className={`text-sm font-medium leading-tight line-clamp-2 px-2 ${textPrimary}`}
                                        title={file.name}
                                    >
                                        {file.name}
                                    </h3>

                                    {/* Annotations badge if any (kept as it's useful context) */}
                                    {file.annotations && file.annotations.length > 0 && (
                                        <div className="mt-1 flex justify-center">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                                                {file.annotations.length} note{file.annotations.length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    )}
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

