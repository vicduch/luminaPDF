import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Trash2,
  Upload,
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
    // Une liste déjà connue reste affichée pendant l'actualisation : pas de disparition transitoire des actions.
    if (knownFilesRef.current.length === 0) setLoading(true);
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
      className="library-view flex-1 h-full overflow-y-auto transition-colors duration-200"
      style={{
        backgroundColor: 'var(--lumina-toolbar-bg)',
        color: 'var(--lumina-text-primary)',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Bandeau manuel OneLearn */}
      <header
        className="sticky top-0 z-30 w-full transition-colors"
        style={{
          backgroundColor: 'var(--lumina-toolbar-bg)',
          borderBottom: '1px solid var(--lumina-filet)',
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="text-base sm:text-lg font-medium tracking-tight truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              LuminaPDF
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto shrink-0">
            {setThemeVariant && (
              <div
                role="group"
                aria-label="Variante de luminosité"
                className="inline-flex items-center rounded-[2px] p-0.5"
                style={{
                  backgroundColor: 'transparent',
                  }}
              >
                <button
                  type="button"
                  onClick={() => setThemeVariant('light')}
                  aria-pressed={themeVariant === 'light'}
                  aria-label="Mode Jour"
                  title="Mode Jour"
                  className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2.5 rounded-[2px] text-xs font-medium transition-colors"
                  style={
                    themeVariant === 'light'
                      ? {
                          backgroundColor: 'transparent',
                          color: 'var(--lumina-accent)',
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
                  className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2.5 rounded-[2px] text-xs font-medium transition-colors"
                  style={
                    themeVariant === 'dark'
                      ? {
                          backgroundColor: 'transparent',
                          color: 'var(--lumina-accent)',
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
                  className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'transparent',
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
                    className="absolute right-0 top-full mt-2 w-72 rounded-[2px] p-3 z-50 grid grid-cols-3 gap-1.5"
                    style={{
                      backgroundColor: 'var(--lumina-toolbar-bg)',
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
                          className="flex items-center gap-1.5 min-h-[44px] px-2 py-1.5 rounded-[2px] text-left text-xs font-medium transition-colors"
                          style={
                            selected
                              ? {
                                  backgroundColor: 'transparent',
                                  color: 'var(--lumina-accent)',
                                  outline: '1.5px solid var(--lumina-accent)',
                                }
                              : {
                                  color: 'var(--lumina-text-primary)',
                                }
                          }
                        >
                          <span
                            aria-hidden="true"
                            className="w-4 h-4 rounded-[2px] flex items-center justify-center text-[9px] font-bold shrink-0"
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
              className="library-primary inline-flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] px-3.5 sm:px-4 rounded-[2px] text-sm font-semibold transition-colors"
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7">
        <h1
          className="library-title"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Bibliothèque
        </h1>

        {(storageError || error) && (
          <p
            role="alert"
            className="rounded-[2px] px-4 py-3 text-sm"
            style={{
              backgroundColor: 'var(--lumina-toolbar-bg)',
              border: '1px solid var(--lumina-accent)',
              color: 'var(--lumina-text-primary)',
            }}
          >
            {storageError || error}
          </p>
        )}

        {loading && <p role="status">Chargement de la bibliothèque…</p>}
        {readError && (
          <div role="alert" className="rounded-[2px] p-4 space-y-3" style={{ backgroundColor: 'var(--lumina-toolbar-bg)' }}>
            <p>{readError}</p>
            <button type="button" onClick={() => void loadRecentFiles()} className="library-primary min-h-[44px] px-4 rounded-[2px]" style={{ backgroundColor: 'var(--lumina-accent)', color: 'var(--lumina-accent-fg)' }}>Réessayer</button>
          </div>
        )}

        {/* Section 1 : Reprendre la lecture (Document vedette files[0]) */}
        {heroFile && (
          <section aria-label="Reprendre la lecture" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                className="sr-only"
                style={{ color: 'var(--lumina-text-secondary)' }}
              >
                <span>Reprendre la lecture</span>
              </h2>
            </div>

            <div
              onClick={() => void handleOpen(heroFile)}
              className="library-resume cursor-pointer flex items-start sm:items-center gap-4 sm:gap-6"
            >
              {/* Aperçu du document, ou format si indisponible */}
              <div
                aria-hidden="true"
                className="w-14 h-20 sm:w-20 sm:h-28 rounded-[2px] shrink-0 overflow-hidden flex items-center justify-center select-none"
                style={{
                  backgroundColor: 'var(--lumina-paper-bg)',
                  color: 'var(--lumina-paper-fg)',
                  border: '1px solid var(--lumina-filet-fort)',
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
                  <span className="text-sm font-medium">PDF</span>
                )}
              </div>

              {/* Détails & Progression */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <span
                      className="block text-xs"
                      style={{ color: 'var(--lumina-text-secondary)' }}
                    >
                      Reprendre la lecture · {formatDate(heroFile.lastVisited)}
                    </span>
                    <h3
                      className="resume-file-name font-medium truncate"
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
                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[2px] transition-colors shrink-0"
                    style={{
                      color: 'var(--lumina-text-secondary)',
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
                      style={{ color: 'var(--lumina-text-secondary)' }}
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
                      className="w-full h-1 rounded-[2px] overflow-hidden"
                      style={{ backgroundColor: 'var(--lumina-hover-bg)' }}
                    >
                      <div
                        className="h-full rounded-[2px] transition-all duration-200"
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
                  className="library-primary min-h-[44px] px-4 rounded-[2px] inline-flex items-center gap-2 text-sm font-semibold"
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
              className="text-sm font-semibold"
              style={{ color: 'var(--lumina-text-secondary)' }}
            >
              <span>Lectures récentes</span>
            </h2>

            <div className="recent-file-list">
              {otherFiles.map((file) => {
                return (
                  <div
                    key={file.id}
                    onClick={() => void handleOpen(file)}
                    className="recent-file-row py-3 cursor-pointer grid grid-cols-[2.75rem_minmax(0,1fr)] sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                  >
                    <div
                      aria-hidden="true"
                      className="w-11 h-14 row-span-2 sm:row-span-1 rounded-[2px] shrink-0 overflow-hidden flex flex-col items-center justify-center text-[11px] font-semibold select-none"
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
                        className="recent-file-name font-medium truncate"
                        style={{ color: 'var(--lumina-text-primary)' }}
                        title={file.name}
                      >
                        {file.name}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: 'var(--lumina-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        <span
                          className="whitespace-nowrap"
                        >
                          {formatPageProgress(file)}
                        </span>
                        <span>·</span>
                        <span className="truncate">{formatDate(file.lastVisited)}</span>
                      </div>
                    </div>

                    <div className="col-start-2 sm:col-start-auto flex items-center gap-1">
                      <button type="button" aria-label={`Ouvrir ${file.name}`}
                        onClick={(event) => { event.stopPropagation(); void handleOpen(file); }}
                        className="min-h-[44px] px-3 rounded-[2px] text-sm font-semibold"
                        style={{ color: 'var(--lumina-accent)' }}>
                        Ouvrir
                      </button>
                      <button
                        type="button"
                        disabled={removing !== null}
                        onClick={(e) => void handleDelete(e, file.id)}
                        className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[2px] transition-colors shrink-0"
                        style={{
                          color: 'var(--lumina-text-secondary)',
                        }}
                        title={`Retirer ${file.name} de la bibliothèque`}
                        aria-label={`Retirer ${file.name} de la bibliothèque`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
            className="library-dropzone px-0 py-5 cursor-pointer transition-colors duration-200"
            style={{
              backgroundColor: isDragging ? 'var(--lumina-active-bg)' : 'transparent',
              borderTop: `1px dashed ${isDragging ? 'var(--lumina-accent)' : 'var(--lumina-filet-fort)'}`,
              borderBottom: `1px dashed ${isDragging ? 'var(--lumina-accent)' : 'var(--lumina-filet-fort)'}`,
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
            <div className="flex items-center gap-3">
              <FileText aria-hidden="true" className="w-5 h-5 shrink-0" style={{ color: 'var(--lumina-text-secondary)' }} />
              <div className="space-y-1">
                <h2
                  className="text-base font-medium"
                >
                  {files.length === 0 && !loading && !readError
                    ? 'Ouvrez votre premier PDF'
                    : 'Importer un PDF'}
                </h2>
                <p className="text-xs sm:text-sm" style={{ color: 'var(--lumina-text-secondary)' }}>
                  Glissez un PDF ici, ou choisissez un fichier.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-8 text-xs space-y-2" style={{ color: 'var(--lumina-text-secondary)' }}>
        <p className="max-w-2xl leading-relaxed">Documents et progression dans ce navigateur uniquement. Conservez vos fichiers d’origine : ce stockage n’est pas une sauvegarde indépendante.</p>
        <p className="text-xs">Services facultatifs · aucune synchronisation entre appareils garantie.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void handleCloud()} disabled={!cloudConfigured || remoteBusy}
            className="min-h-[44px] px-3 rounded-[2px] text-xs disabled:opacity-60" style={{ color: 'var(--lumina-text-primary)' }}>
            {cloudUser ? 'Déconnexion' : 'Connexion Cloud'}
          </button>
          <button type="button" onClick={() => void handleDriveOpen()} disabled={!driveConfigured || remoteBusy}
            className="min-h-[44px] px-3 rounded-[2px] text-xs disabled:opacity-60" style={{ color: 'var(--lumina-text-primary)' }}>
            Google Drive
          </button>
        </div>
        {(!cloudConfigured || !driveConfigured) && (
          <p>
            {!cloudConfigured && 'Connexion Cloud non configurée.'}
            {!cloudConfigured && !driveConfigured && ' '}
            {!driveConfigured && 'Google Drive non configuré.'}
          </p>
        )}
        {remoteBusy && <p role="status">Connexion au service en cours…</p>}
      </footer>
    </div>
  );
};

export default RecentFiles;
