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

            // 3. Merge: only show cloud files that also exist locally (we can't open cloud-only entries)
            // Cloud entries without a local blob would cause "file not available" errors
            const allFiles = [...local];
            // Cloud files are synced for metadata only; skip any that aren't stored locally

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

                // App.tsx handleOpenFile will save it to IndexedDB automatically
                onFileSelect(file);
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
            // Always try local IndexedDB first (Drive files are also saved locally)
            const blob = await getFileBlob(fileMeta.id);
            if (blob) {
                const file = new File([blob], fileMeta.name, { type: blob.type || fileMeta.type });
                onFileSelect(file);
            } else {
                console.warn("Blob introuvable localement pour:", fileMeta.name);
                alert("Ce fichier n'est plus disponible localement. Veuillez le réouvrir depuis Google Drive ou votre appareil.");
            }
        } catch (e) {
            console.error("Failed to open file", e);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            // 1. Suppression locale (IndexedDB)
            await deleteRecentFile(id);

            // 2. Suppression Cloud (Supabase) si connecté
            if (user) {
                const { deleteCloudRecentFile } = await import('../services/supabase');
                await deleteCloudRecentFile(id);
            }

            setFiles(prev => prev.filter(f => f.id !== id));
        } catch (error) {
            console.error("Failed to delete file", error);
        }
    };

    if (loading) return <div className="p-10 text-center opacity-50 flex flex-col items-center gap-2"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>Chargement...</div>;

    return (
        <div className="max-w-6xl mx-auto p-8 animate-fade-in">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6 border-b border-black/5 dark:border-white/5 pb-8">
                <div className="flex flex-col">
                    <h2 className={`text-3xl font-bold tracking-tight flex items-center gap-3 ${textPrimary}`}>
                        <Clock size={28} className="text-violet-500 opacity-80" />
                        Tableau de bord
                    </h2>
                    <p className={`text-sm mt-1 font-medium opacity-50 ${textSecondary}`}>
                        Gérez vos lectures et documents récents
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {isCloudEnabled && (
                        !user ? (
                            <button
                                onClick={handleLogin}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20 transition-all font-semibold text-sm active:scale-95"
                            >
                                <LogIn size={18} />
                                Connexion Cloud
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleDriveOpen}
                                    disabled={isDriving}
                                    className={`
                                        flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-semibold text-sm
                                        bg-white dark:bg-zinc-800 shadow-sm border border-black/5 dark:border-white/5
                                        hover:bg-gray-50 dark:hover:bg-zinc-700/80 ${textPrimary}
                                        ${isDriving ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}
                                    `}
                                >
                                    {isDriving ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                                    ) : (
                                        <GoogleDriveIcon size={18} />
                                    )}
                                    Google Drive
                                </button>

                                <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 px-4 py-2 rounded-xl border border-black/5 dark:border-white/5 shadow-sm">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                        {user.email?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="hidden sm:block text-xs">
                                        <p className={`font-bold ${textPrimary}`}>{user.email?.split('@')[0]}</p>
                                        <p className="opacity-40 font-medium">Connecté</p>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors"
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
                <div className="flex flex-col items-center justify-center p-20 mt-4 border-2 border-dashed border-black/5 dark:border-white/5 rounded-[32px] bg-black/5 dark:bg-white/5">
                    <Cloud size={64} className="mb-6 text-violet-500 opacity-20" />
                    <h3 className={`text-2xl font-bold tracking-tight ${textPrimary}`}>Bibliothèque vide</h3>
                    <p className={`mt-2 font-medium opacity-50 text-center max-w-sm ${textSecondary}`}>
                        Glissez-déposez un PDF ici ou utilisez le bouton ci-dessous pour démarrer.
                    </p>
                    <label className="mt-8 cursor-pointer bg-violet-600 hover:bg-violet-700 text-white px-8 py-4 rounded-2xl shadow-xl shadow-violet-500/20 transition-all hover:scale-105 active:scale-95 font-bold flex items-center gap-3">
                        <HardDrive size={22} />
                        Parcourir mes fichiers
                        <input type="file" accept="application/pdf" onChange={(e) => {
                            if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
                        }} className="hidden" />
                    </label>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                    {files.map(file => {
                        return (
                            <div
                                key={file.id}
                                onClick={() => handleOpen(file)}
                                className={`
                                    group relative flex flex-col items-center p-3 rounded-[24px] transition-all duration-300 cursor-pointer
                                    ${cardBg} active:scale-95
                                    hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]
                                    border border-transparent hover:border-black/5 dark:hover:border-white/10
                                `}
                            >
                                {/* Delete button - Absolute top right */}
                                <button
                                    onClick={(e) => handleDelete(e, file.id)}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all z-10 shadow-sm"
                                    title="Supprimer"
                                >
                                    <Trash2 size={14} />
                                </button>

                                {/* Cover / Thumbnail */}
                                <div className="relative w-full aspect-[3/4] mb-4 rounded-2xl overflow-hidden shadow-lg transition-all group-hover:shadow-2xl group-hover:-translate-y-1">
                                    {file.thumbnail ? (
                                        <img
                                            src={file.thumbnail}
                                            alt={file.name}
                                            className="w-full h-full object-cover"
                                            draggable={false}
                                        />
                                    ) : (
                                        <div className={`
                                            w-full h-full flex items-center justify-center
                                            bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 dark:from-violet-500/30 dark:to-fuchsia-500/20
                                        `}>
                                            <FileText size={48} className="text-violet-500 opacity-40 group-hover:scale-110 transition-transform duration-500" />
                                        </div>
                                    )}

                                    {/* Overlay Info */}
                                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-[10px] text-white font-bold uppercase tracking-widest leading-none">
                                            {file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} Mo` : 'PDF'}
                                        </p>
                                    </div>
                                </div>

                                {/* File Name */}
                                <div className="w-full text-center px-1">
                                    <h3
                                        className={`text-xs font-bold leading-snug line-clamp-2 min-h-[32px] ${textPrimary} tracking-tight`}
                                        title={file.name}
                                    >
                                        {file.name}
                                    </h3>

                                    {/* Annotations badge */}
                                    {file.annotations && file.annotations.length > 0 && (
                                        <div className="mt-2 flex justify-center">
                                            <span className="text-[9px] px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/30 animate-pulse">
                                                {file.annotations.length} NOTE{file.annotations.length > 1 ? 'S' : ''}
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

