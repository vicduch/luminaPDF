import React from 'react';

export enum AppTheme {
  LIGHT = 'light',
  SEPIA = 'sepia',
  DARK = 'dark',
  MIDNIGHT = 'midnight',     // OLED Black
  BLUE_NIGHT = 'blue_night', // Deep Blue
  FOREST = 'forest',         // Dark Green
  SOLARIZED = 'solarized'    // Soft Light
}

export enum ViewMode {
  SINGLE = 'single',
  DOUBLE = 'double'
}

export enum ScrollMode {
  PAGED = 'paged',
  CONTINUOUS = 'continuous'
}

export enum AiModel {
  FLASH_2_5 = 'gemini-2.5-flash',
  FLASH_3_0 = 'gemini-3.0-flash',
  PRO_3_0 = 'gemini-3-pro-preview'
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface Annotation {
  id: string;
  pageNumber: number;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  text: string;
  color: string; // hex code
  createdAt: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  producer?: string;
  creator?: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
}

export interface PdfDocumentProps {
  file: File | string | null;
  pageNumber: number;
  numPages: number;
  scale: number;
  renderedScale: number; // For smooth zoom
  zoomFocalPoint?: { x: number; y: number } | null;
  isFitToScreenAction?: boolean; // Explicit flag for "Fit to Screen" action
  viewMode: ViewMode;
  scrollMode: ScrollMode;
  isOutlineOpen: boolean;
  isAnnotationMode: boolean;
  annotations: Annotation[];
  annotationColor: string;
  onLoadSuccess: (data: { numPages: number }) => void;
  onMetadataLoaded: (metadata: PdfMetadata) => void;
  onPageDimensions?: (dims: { width: number; height: number }) => void;
  onContainerDimensions?: (dims: { width: number; height: number }) => void;
  onAddAnnotation: (page: number, x: number, y: number) => void;
  onUpdateAnnotation: (id: string, text: string, color?: string) => void;
  onDeleteAnnotation: (id: string) => void;
  setPageNumber: (page: number) => void;
  theme: AppTheme;
}

export interface ToolbarProps {
  file: File | string | null;
  numPages: number;
  pageNumber: number;
  scale: number;
  theme: AppTheme;
  viewMode: ViewMode;
  scrollMode: ScrollMode;
  isFullscreen: boolean;
  isVisible: boolean;
  isOutlineOpen: boolean;
  isAnnotationMode: boolean;
  annotationColor: string;
  setPageNumber: (page: number) => void;
  setScale: (scale: number) => void;
  onFitToWidth: () => void;
  setTheme: (theme: AppTheme) => void;
  setViewMode: (mode: ViewMode) => void;
  setScrollMode: (mode: ScrollMode) => void;
  setAnnotationColor: (color: string) => void;
  toggleFullscreen: () => void;
  toggleOutline: () => void;
  toggleAnnotationMode: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleAiPanel: () => void;
  toggleVisibility: () => void;
  onHome?: () => void;
}

export interface AiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageText: string;
  pdfMetadata: PdfMetadata | null;
  theme: AppTheme;
}