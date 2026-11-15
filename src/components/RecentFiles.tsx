import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Clock,
  Trash2,
  Upload,
  Sparkles,
  BookOpen,
  Sun,
  Moon,
  Palette,
  ArrowRight,
} from 'lucide-react';
import {
  getRecentFiles,
  getFileBlob,
  deleteRecentFile,
  initializeStorage,
  RecentFileMetadata,
} from '../services/storage';
import { AppTheme, ThemeVariant } from '../types';
import { THEME_LIST } from '../utils/ThemeManager';
import { openDrivePicker, downloadDriveFile } from '../services/drive';

interface RecentFilesProps {
  onFileSelect: (file: File) => void;
  knownFiles?: RecentFileMetadata[];
  onFilesChange?: (files: RecentFileMetadata[]) => void;
  theme?: AppTheme;
  themeVariant?: ThemeVariant;
  setTheme?: (theme: AppTheme) => void;
  setThemeVariant?: (variant: ThemeVariant) => void;
}

const RecentFiles: React.FC<RecentFilesProps> = ({
  onFileSelect,
  knownFiles = [],
  onFilesChange,
  theme = AppTheme.LIGHT,
  themeVariant = 'light',
  setTheme,
  setThemeVariant,
}) => {
  const [files, setFiles] = useState<RecentFileMetadata[]>(knownFiles);
  const [loading, setLoading] = useState(knownFiles.length === 0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const removingRef = useRef(false);
  const [cloudUser, setCloudUser] = useState<{ id: string } | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const remoteBusyRef = useRef(false);
  const cloudConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const driveConfigured = Boolean(import.meta.env.VITE_GOOGLE_API_KEY && import.meta.env.VITE_GOOGLE_CLIENT_ID && import.meta.env.VITE_GOOGLE_APP_ID);
  const knownFilesRef = useRef<RecentFileMetadata[]>(knownFiles);
  const onFilesChangeRef = useRef(onFilesChange);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    knownFilesRef.current = knownFiles;
  }, [knownFiles]);

  useEffect(() => {
    onFilesChangeRef.current = onFilesChange;
  }, [onFilesChange]);

  useEffect(() => {
    void loadRecentFiles();
  }, []);

  useEffect(() => {
    // État de session existant, sans vérification distante getUser au montage.
    if (!cloudConfigured) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import('../services/supabase').then(service => {
      if (!disposed) unsubscribe = service.onAuthStateChange(setCloudUser);
    }).catch(() => {
      if (!disposed) setError('La connexion Cloud est indisponible. Vos documents locaux restent accessibles.');
    });
    return () => { disposed = true; unsubscribe?.(); };
  }, [cloudConfigured]);

  const handleCloud = async () => {
    if (!cloudConfigured || remoteBusyRef.current) return;
    remoteBusyRef.current = true;
    setRemoteBusy(true);
    setError(null);
    try {
      const service = await import('../services/supabase');
      if (cloudUser) {
        await service.signOut();
        setCloudUser(null);
      } else {
        await service.signInWithGoogle();
      }
    } catch {
      setError('Impossible de modifier la connexion Cloud. Réessayez ; les documents locaux sont conservés.');
    } finally {
      remoteBusyRef.current = false;
      setRemoteBusy(false);
    }
  };

  const handleDriveOpen = async () => {
    if (!driveConfigured || remoteBusyRef.current) return;
    remoteBusyRef.current = true;
    setRemoteBusy(true);
    setError(null);
    try {
      const selected = await openDrivePicker();
      if (selected) {
        const blob = await downloadDriveFile(selected);
        onFileSelect(new File([blob], selected.name, { type: selected.mimeType }));
      }
    } catch {
      setError('Google Drive est indisponible. Réessayez ou importez votre PDF depuis cet appareil.');
    } finally {
      remoteBusyRef.current = false;
      setRemoteBusy(false);
    }
  };

  useEffect(() => {
    if (!isPaletteOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setIsPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isPaletteOpen]);

  const loadRecentFiles = async () => {
    setLoading(true);
    setReadError(null);
    setStorageError(null);
    try {
      await initializeStorage().catch(() => {
        setStorageError(
          'Impossible de convertir certains documents sur cet appareil. Les données d’origine sont conservées ; la conversion reprendra au prochain démarrage.'
        );
      });
      const local = await getRecentFiles();
      const merged = local.map((item) => {
        if (item.numPages && item.numPages > 0) return item;
        const known = knownFilesRef.current.find((k) => k.id === item.id);
        return known?.numPages ? { ...item, numPages: known.numPages } : item;
      });
      merged.sort((a, b) => b.lastVisited - a.lastVisited);
      setFiles(merged);
      onFilesChangeRef.current?.(merged);
    } catch (err) {
      setReadError('Impossible de lire la bibliothèque : le stockage de cet appareil est indisponible. Vos données ne sont pas effacées.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (fileMeta: RecentFileMetadata) => {
    setError(null);
    try {
      const blob = await getFileBlob(fileMeta.id);
      if (blob) {
        const file = new File([blob], fileMeta.name, { type: blob.type || fileMeta.type || 'application/pdf' });
        onFileSelect(file);
      } else {
        setError(
          "Ce fichier n'est plus disponible dans ce navigateur. Importez-le à nouveau pour le rouvrir."
        );
      }
    } catch (err) {
      console.error('Error opening file:', err);
      setError('Impossible d’ouvrir ce PDF. Réessayez ou importez le fichier à nouveau.');
    }
  };

  const handleDelete = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (removingRef.current) return;
    const name = files.find((f) => f.id === fileId)?.name || fileId;
    if (
      !window.confirm(
        `Retirer « ${name} » de la bibliothèque ? La copie, la progression et les notes de ce document seront effacées de cet appareil.`
      )
    ) {
      return;
    }
    removingRef.current = true;
    setRemoving(fileId);
    setError(null);
    try {
      await deleteRecentFile(fileId);
      const remaining = files.filter((f) => f.id !== fileId);
      knownFilesRef.current = remaining;
      setFiles(remaining);
      onFilesChangeRef.current?.(remaining);
    } catch {
      setError('Impossible de retirer ce document de la bibliothèque. Réessayez lorsque le stockage est disponible.');
    } finally {
      removingRef.current = false;
      setRemoving(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    return date.toLocaleDateString('fr-FR');
  };

  const formatPageProgress = (file: RecentFileMetadata) => {
    const current = file.pageNumber || 1;
    if (file.numPages && file.numPages > 0) {
      return `Page ${current} sur ${file.numPages}`;
    }
    return `Page ${current}`;
  };

  const getProgressPercent = (file: RecentFileMetadata) => {
    if (!file.numPages || file.numPages <= 0) return null;
    const current = file.pageNumber || 1;
    return Math.min(100, Math.max(2, Math.round((current / file.numPages) * 100)));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        onFileSelect(droppedFile);
      }
    }
  };

  const heroFile = !loading && !readError ? files[0] : undefined;
  const otherFiles = !loading && !readError ? files.slice(1) : [];

  return (
    <div
      className="flex-1 h-full overflow-y-auto transition-colors duration-200"
      style={{
        backgroundColor: 'var(--lumina-app-bg)',
        color: 'var(--lumina-text-primary)',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Barre supérieure éditoriale Option A */}
      <header
        className="sticky top-0 z-30 w-full backdrop-blur-md transition-colors"
        style={{
          backgroundColor: 'var(--lumina-toolbar-bg)',
          borderBottom: '1px solid var(--lumina-filet)',
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: 'var(--lumina-accent)' }}
            />
            <span
              className="text-base sm:text-lg font-medium tracking-tight truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              LuminaPDF
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {setThemeVariant && (
              <div
                role="group"
                aria-label="Variante de luminosité"
                className="inline-flex items-center rounded-full p-0.5"
                style={{
                  backgroundColor: 'var(--lumina-hover-bg)',
                  }}
              >
                <button
                  type="button"
                  onClick={() => setThemeVariant('light')}
                  aria-pressed={themeVariant === 'light'}
                  aria-label="Mode Jour"
                  title="Mode Jour"
                  className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2.5 rounded-full text-xs font-medium transition-colors"
                  style={
                    themeVariant === 'light'
                      ? {
                          backgroundColor: 'var(--lumina-paper-bg)',
                          color: 'var(--lumina-text-primary)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }
                      : { color: 'var(--lumina-text-secondary)' }
                  }
                >
                  <Sun className="w-4 h-4" />
                  <span className="hidden sm:inline">Jour</span>
                </button>
                <button
                  type="button"
                  onClick={() => setThemeVariant('dark')}
                  aria-pressed={themeVariant === 'dark'}
                  aria-label="Mode Nuit"
                  title="Mode Nuit"
                  className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2.5 rounded-full text-xs font-medium transition-colors"
                  style={
                    themeVariant === 'dark'
                      ? {
                          backgroundColor: 'var(--lumina-paper-bg)',
                          color: 'var(--lumina-text-primary)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.14)',
                        }
                      : { color: 'var(--lumina-text-secondary)' }
                  }
                >
                  <Moon className="w-4 h-4" />
                  <span className="hidden sm:inline">Nuit</span>
                </button>
              </div>
            )}

            {setTheme && (
              <div ref={paletteRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsPaletteOpen((open) => !open)}
                  aria-label="Choisir l'ambiance de couleur"
                  aria-expanded={isPaletteOpen}
                  className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 rounded-full text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: isPaletteOpen ? 'var(--lumina-active-bg)' : 'var(--lumina-hover-bg)',
                    color: isPaletteOpen ? 'var(--lumina-accent)' : 'var(--lumina-text-primary)',
                      }}
                >
                  <Palette className="w-4 h-4" />
                  <span className="hidden md:inline">Ambiance</span>
                </button>

                {isPaletteOpen && (
                  <div
                    role="region"
                    aria-label="Ambiances de lecture"
                    className="absolute right-0 top-full mt-2 w-72 rounded-2xl p-3 z-50 grid grid-cols-3 gap-1.5"
                    style={{
                      backgroundColor: 'var(--lumina-toolbar-bg)',
                            boxShadow: 'var(--lumina-shadow)',
                    }}
                  >
                    {THEME_LIST.map((item) => {
                      const selected = theme === item.id;
                      const swatch = themeVariant === 'dark' ? item.nuit : item.jour;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={item.name}
                          aria-pressed={selected}
                          onClick={() => {
                            setTheme(item.id);
                            setIsPaletteOpen(false);
                          }}
                          className="flex items-center gap-1.5 min-h-[44px] px-2 py-1.5 rounded-xl text-left text-xs font-medium transition-colors"
                          style={
                            selected
                              ? {
                                  backgroundColor: 'var(--lumina-active-bg)',
                                  color: 'var(--lumina-accent)',
                                  outline: '1.5px solid var(--lumina-accent)',
                                }
                              : {
                                  backgroundColor: 'var(--lumina-hover-bg)',
                                  color: 'var(--lumina-text-primary)',
                                }
                          }
                        >
                          <span
                            aria-hidden="true"
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{
                              backgroundColor: swatch.paperBg,
                              color: swatch.paperFg,
                              border: '1px solid rgba(128,128,128,0.28)',
                            }}
                          >
                            Aa
                          </span>
                          <span className="truncate">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] px-3.5 sm:px-4 rounded-full text-xs font-semibold transition-transform active:scale-95"
              style={{
                backgroundColor: 'var(--lumina-accent)',
                color: 'var(--lumina-accent-fg)',
              }}
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Importer un PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        {/* En-tête éditorial */}
        <div className="space-y-2 max-w-2xl">
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--lumina-accent)' }}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Bibliothèque locale</span>
          </div>
          <h1
            className="text-2xl sm:text-4xl font-normal tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Vos lectures en cours
          </h1>
          <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--lumina-text-secondary)' }}>
            Vos PDF et votre progression sont conservés dans ce navigateur, sur cet appareil uniquement. Ce stockage n’est pas une sauvegarde indépendante : gardez vos fichiers d’origine.
          </p>
        </div>

        {(storageError || error) && (
          <p
            role="alert"
            className="rounded-2xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'var(--lumina-toolbar-bg)',
              border: '1px solid var(--lumina-accent)',
              color: 'var(--lumina-text-primary)',
              boxShadow: 'var(--lumina-shadow)',
            }}
          >
            {storageError || error}
          </p>
        )}

        {loading && <p role="status">Chargement de la bibliothèque…</p>}
        {readError && (
          <div role="alert" className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: 'var(--lumina-toolbar-bg)' }}>
            <p>{readError}</p>
            <button type="button" onClick={() => void loadRecentFiles()} className="min-h-[44px] px-4 rounded-xl" style={{ backgroundColor: 'var(--lumina-accent)', color: 'var(--lumina-accent-fg)' }}>Réessayer</button>
          </div>
        )}

        {/* Section 1 : Reprendre la lecture (Document vedette files[0]) */}
        {heroFile && (
          <section aria-label="Reprendre la lecture" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
                style={{ color: 'var(--lumina-text-secondary)' }}
              >
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--lumina-accent)' }} />
                <span>Reprendre la lecture</span>
              </h2>
            </div>

            <div
              onClick={() => void handleOpen(heroFile)}
              className="group relative rounded-3xl p-5 sm:p-7 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-7"
              style={{
                backgroundColor: 'var(--lumina-toolbar-bg)',
                boxShadow: 'var(--lumina-shadow)',
              }}
            >
              {/* Vignette feuille papier stylisée */}
              <div
                aria-hidden="true"
                className="w-20 h-28 sm:w-24 sm:h-32 rounded-xl shrink-0 overflow-hidden flex flex-col justify-between select-none"
                style={{
                  backgroundColor: 'var(--lumina-paper-bg)',
                  color: 'var(--lumina-paper-fg)',
                  border: '1px solid var(--lumina-filet-fort)',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                }}
              >
                {heroFile.thumbnail ? (
                  <img
                    src={heroFile.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="p-3 h-full flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="w-8 h-1 rounded-full opacity-50" style={{ backgroundColor: 'var(--lumina-accent)' }} />
                      <div className="w-full h-1 rounded-full opacity-25" style={{ backgroundColor: 'var(--lumina-paper-fg)' }} />
                      <div className="w-4/5 h-1 rounded-full opacity-25" style={{ backgroundColor: 'var(--lumina-paper-fg)' }} />
                      <div className="w-full h-1 rounded-full opacity-20" style={{ backgroundColor: 'var(--lumina-paper-fg)' }} />
                    </div>
                    <div
                      className="text-[11px] font-medium tracking-tight"
                      style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      p. {heroFile.pageNumber || 1}
                    </div>
                  </div>
                )}
              </div>

              {/* Détails & Progression */}
              <div className="flex-1 min-w-0 space-y-3 w-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <span
                      className="inline-block text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--lumina-accent)' }}
                    >
                      Dernière lecture · {formatDate(heroFile.lastVisited)}
                    </span>
                    <h3
                      className="text-lg sm:text-2xl font-medium truncate"
                      style={{
                        fontFamily: 'var(--font-display)',
                        color: 'var(--lumina-text-primary)',
                      }}
                      title={heroFile.name}
                    >
                      {heroFile.name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => void handleDelete(e, heroFile.id)}
                    disabled={removing !== null}
                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full transition-colors shrink-0"
                    style={{
                      color: 'var(--lumina-text-secondary)',
                      backgroundColor: 'var(--lumina-hover-bg)',
                    }}
                    title={`Retirer ${heroFile.name} de la bibliothèque`}
                    aria-label={`Retirer ${heroFile.name} de la bibliothèque`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 max-w-md">
                  <div className="flex items-center justify-between text-xs font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span
                      className="px-2.5 py-1 rounded-full font-semibold"
                      style={{
                        backgroundColor: 'var(--lumina-active-bg)',
                        color: 'var(--lumina-accent)',
                      }}
                    >
                      {formatPageProgress(heroFile)}
                    </span>
                    {getProgressPercent(heroFile) !== null && (
                      <span style={{ color: 'var(--lumina-text-secondary)' }}>
                        {getProgressPercent(heroFile)} %
                      </span>
                    )}
                  </div>

                  {getProgressPercent(heroFile) !== null && (
                    <div
                      className="w-full h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--lumina-hover-bg)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${getProgressPercent(heroFile)}%`,
                          backgroundColor: 'var(--lumina-accent)',
                        }}
                      />
                    </div>
                  )}
                </div>

                <button type="button" aria-label={`Reprendre ${heroFile.name} à la page ${heroFile.pageNumber || 1}`}
                  onClick={(event) => { event.stopPropagation(); void handleOpen(heroFile); }}
                  className="min-h-[44px] px-4 rounded-full inline-flex items-center gap-2 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--lumina-accent)', color: 'var(--lumina-accent-fg)' }}>
                  <span>Reprendre à la page {heroFile.pageNumber || 1}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Section 2 : Autres lectures récentes (files.slice(1)) */}
        {otherFiles.length > 0 && (
          <section aria-label="Lectures récentes" className="space-y-3">
            <h2
              className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
              style={{ color: 'var(--lumina-text-secondary)' }}
            >
              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--lumina-accent)' }} />
              <span>Autres documents récents</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {otherFiles.map((file) => {
                const pct = getProgressPercent(file);
                return (
                  <div
                    key={file.id}
                    onClick={() => void handleOpen(file)}
                    className="group relative rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5"
                    style={{
                      backgroundColor: 'var(--lumina-toolbar-bg)',
                            boxShadow: 'var(--lumina-shadow)',
                    }}
                  >
                    <div
                      aria-hidden="true"
                      className="w-11 h-14 rounded-lg shrink-0 overflow-hidden flex flex-col items-center justify-center text-[11px] font-semibold select-none"
                      style={{
                        backgroundColor: 'var(--lumina-paper-bg)',
                        color: 'var(--lumina-paper-fg)',
                        border: '1px solid var(--lumina-filet-fort)',
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {file.thumbnail ? (
                        <img
                          src={file.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span>PDF</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <h3
                        className="text-sm sm:text-base font-medium truncate"
                        style={{
                          fontFamily: 'var(--font-display)',
                          color: 'var(--lumina-text-primary)',
                        }}
                        title={file.name}
                      >
                        {file.name}
                      </h3>

                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--lumina-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        <span
                          className="font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: 'var(--lumina-active-bg)',
                            color: 'var(--lumina-accent)',
                          }}
                        >
                          {formatPageProgress(file)}
                        </span>
                        <span>·</span>
                        <span className="truncate">{formatDate(file.lastVisited)}</span>
                      </div>

                      {pct !== null && (
                        <div
                          className="w-full h-1 rounded-full overflow-hidden"
                          style={{ backgroundColor: 'var(--lumina-hover-bg)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: 'var(--lumina-accent)',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <button type="button" aria-label={`Ouvrir ${file.name}`}
                      onClick={(event) => { event.stopPropagation(); void handleOpen(file); }}
                      className="min-h-[44px] px-3 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: 'var(--lumina-hover-bg)', color: 'var(--lumina-accent)' }}>
                      Ouvrir
                    </button>
                    <button
                      type="button"
                      disabled={removing !== null}
                      onClick={(e) => void handleDelete(e, file.id)}
                      className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full transition-colors shrink-0"
                      style={{
                        color: 'var(--lumina-text-secondary)',
                        backgroundColor: 'var(--lumina-hover-bg)',
                      }}
                      title={`Retirer ${file.name} de la bibliothèque`}
                      aria-label={`Retirer ${file.name} de la bibliothèque`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Zone d'importation / Glisser-déposer */}
        <section aria-label="Importer un document">
          <div
            role="button"
            tabIndex={0}
            aria-label="Parcourir les fichiers PDF"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-3xl p-7 sm:p-10 text-center cursor-pointer transition-all duration-200 ${
              isDragging ? 'scale-[1.01]' : ''
            }`}
            style={{
              backgroundColor: isDragging ? 'var(--lumina-active-bg)' : 'var(--lumina-paper-bg)',
              border: `1.5px dashed ${isDragging ? 'var(--lumina-accent)' : 'var(--lumina-filet-fort)'}`,
              boxShadow: 'var(--lumina-shadow)',
            }}
          >
            <input
              ref={fileInputRef}
              onClick={(event) => event.stopPropagation()}
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  onFileSelect(e.target.files[0]);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--lumina-active-bg)',
                  color: 'var(--lumina-accent)',
                }}
              >
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2
                  className="text-base sm:text-lg font-medium"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {files.length === 0 && !loading && !readError
                    ? 'Ouvrez votre premier PDF'
                    : 'Ouvrir un autre fichier PDF'}
                </h2>
                <p className="text-xs sm:text-sm" style={{ color: 'var(--lumina-text-secondary)' }}>
                  Touchez pour parcourir vos fichiers ou glissez-déposez un document PDF ici.
                </p>
              </div>
              <div
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full"
                style={{
                  backgroundColor: 'var(--lumina-hover-bg)',
                  color: 'var(--lumina-text-secondary)',
                }}
              >
                <Sparkles className="w-3 h-3" style={{ color: 'var(--lumina-accent)' }} />
                <span>Conservez aussi vos fichiers d’origine</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-8 text-xs space-y-3" style={{ color: 'var(--lumina-text-secondary)' }}>
        <p>Services facultatifs · aucune synchronisation entre appareils garantie.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void handleCloud()} disabled={!cloudConfigured || remoteBusy}
            className="min-h-[44px] px-4 rounded-xl disabled:opacity-60" style={{ backgroundColor: 'var(--lumina-hover-bg)', color: 'var(--lumina-text-primary)' }}>
            {cloudUser ? 'Déconnexion' : 'Connexion Cloud'}
          </button>
          <button type="button" onClick={() => void handleDriveOpen()} disabled={!driveConfigured || remoteBusy}
            className="min-h-[44px] px-4 rounded-xl disabled:opacity-60" style={{ backgroundColor: 'var(--lumina-hover-bg)', color: 'var(--lumina-text-primary)' }}>
            Google Drive
          </button>
        </div>
        {!cloudConfigured && <p>Connexion Cloud non configurée sur cette installation.</p>}
        {!driveConfigured && <p>Google Drive non configuré sur cette installation.</p>}
        {remoteBusy && <p role="status">Connexion au service en cours…</p>}
      </footer>
    </div>
  );
};

export default RecentFiles;
