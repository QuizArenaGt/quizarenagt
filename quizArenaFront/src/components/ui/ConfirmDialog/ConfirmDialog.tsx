import type { ReactNode } from 'react';
import Button from '../Button/Button';
import Modal from '../Modal/Modal';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    loadingLabel?: string;
    isLoading?: boolean;
    /** "danger" para ações destrutivas, como excluir. */
    tone?: 'default' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
}

/*
 * Diálogo de confirmação reutilizável, construído sobre o Modal.
 * Substitui o window.confirm do navegador, mantendo a identidade visual
 * e a acessibilidade (foco preso no diálogo, Esc cancela).
 */
export default function ConfirmDialog({
    isOpen,
    title,
    children,
    confirmLabel,
    loadingLabel,
    isLoading = false,
    tone = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (!isLoading) onCancel();
            }}
            title={title}
        >
            <div className="ui-confirm">
                <div className="ui-confirm__message">{children}</div>
                <div className="ui-confirm__actions">
                    <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button
                        variant={tone === 'danger' ? 'danger' : 'primary'}
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? (loadingLabel ?? confirmLabel) : confirmLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
