import React, { useState, useRef, useEffect } from 'react';
import { Annotation } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// ANNOTATION POPOVER
// ─────────────────────────────────────────────────────────────────────────────

interface AnnotationPopoverProps {
    annotation: Annotation;
    onUpdate: (id: string, text: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

const AnnotationPopover: React.FC<AnnotationPopoverProps> = ({ annotation, onUpdate, onDelete, onClose }) => {
    const [text, setText] = useState(annotation.text);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Auto-focus
    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                // Save before closing
                if (text !== annotation.text) {
                    onUpdate(annotation.id, text);
                }
                onClose();
            }
        };
        // Delay to avoid catching the click that opened the popover
        const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClick);
        };
    }, [text, annotation, onUpdate, onClose]);

    return (
        <div
            ref={popoverRef}
            className="absolute z-50 w-56 rounded-lg shadow-2xl border overflow-hidden"
            style={{
                left: `${Math.min(annotation.x, 75)}%`,
                top: `${annotation.y + 3}%`,
                backgroundColor: 'var(--lumina-bg-secondary, #f4f4f5)',
                borderColor: 'var(--lumina-border, #d4d4d8)',
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium"
                style={{ color: 'var(--lumina-text-muted, #71717a)' }}
            >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: annotation.color }} />
                <span>Note</span>
                <span className="ml-auto opacity-60">
                    {new Date(annotation.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
            </div>

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                    if (text !== annotation.text) onUpdate(annotation.id, text);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        if (text !== annotation.text) onUpdate(annotation.id, text);
                        onClose();
                    }
                }}
                className="w-full px-3 py-2 text-sm resize-none outline-none border-0 bg-transparent"
                style={{ color: 'var(--lumina-text, #18181b)', minHeight: '60px' }}
                placeholder="Écrire une note..."
                rows={3}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-t" style={{ borderColor: 'var(--lumina-border, #d4d4d8)' }}>
                <button
                    onClick={() => {
                        onDelete(annotation.id);
                        onClose();
                    }}
                    className="px-2 py-1 text-xs rounded-md hover:opacity-80 transition-opacity"
                    style={{ color: '#DC2626' }}
                    title="Supprimer"
                >
                    🗑 Supprimer
                </button>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// ANNOTATION LAYER
// ─────────────────────────────────────────────────────────────────────────────

interface AnnotationLayerProps {
    pageNumber: number;
    annotations: Annotation[];
    isAnnotationMode: boolean;
    annotationColor: string;
    onAddAnnotation: (pageNumber: number, x: number, y: number) => void;
    onUpdateAnnotation: (id: string, text: string) => void;
    onDeleteAnnotation: (id: string) => void;
}

const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
    pageNumber,
    annotations,
    isAnnotationMode,
    annotationColor,
    onAddAnnotation,
    onUpdateAnnotation,
    onDeleteAnnotation,
}) => {
    const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
    const layerRef = useRef<HTMLDivElement>(null);

    // Filter annotations for this page
    const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isAnnotationMode) return;

        const rect = layerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Convert to percentage coordinates (0-100)
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        onAddAnnotation(pageNumber, x, y);
    };

    return (
        <div
            ref={layerRef}
            className="absolute inset-0 z-10"
            style={{
                cursor: isAnnotationMode ? 'crosshair' : 'default',
                pointerEvents: isAnnotationMode || pageAnnotations.length > 0 ? 'auto' : 'none',
            }}
            onClick={handleClick}
        >
            {pageAnnotations.map((annotation) => (
                <React.Fragment key={annotation.id}>
                    {/* Marker */}
                    <div
                        className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg transition-transform hover:scale-125"
                        style={{
                            left: `${annotation.x}%`,
                            top: `${annotation.y}%`,
                            backgroundColor: annotation.color,
                            transform: 'translate(-50%, -50%)',
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActivePopoverId(activePopoverId === annotation.id ? null : annotation.id);
                        }}
                        title={annotation.text || 'Cliquez pour éditer'}
                    />

                    {/* Popover */}
                    {activePopoverId === annotation.id && (
                        <AnnotationPopover
                            annotation={annotation}
                            onUpdate={onUpdateAnnotation}
                            onDelete={onDeleteAnnotation}
                            onClose={() => setActivePopoverId(null)}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};

export default AnnotationLayer;
