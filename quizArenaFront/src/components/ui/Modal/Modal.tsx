import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import Icon from '../Icon/Icon';
import './Modal.css';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    /** Conteúdo exibido acima do título (ex.: logotipo). */
    header?: ReactNode;
    children: ReactNode;
}

/*
 * Modal acessível baseado no elemento nativo <dialog>.
 *
 * Decisão: usar showModal() em vez de recriar a lógica manualmente, pois o
 * navegador já oferece camada superior, conteúdo de fundo inerte, foco
 * preso dentro do diálogo e fechamento com Esc.
 *
 * O conteúdo só é montado enquanto o modal está aberto, para que
 * formulários internos voltem ao estado inicial a cada abertura.
 */
export default function Modal({ isOpen, onClose, title, description, header, children }: ModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    // Sincroniza o estado React (isOpen) com o estado do <dialog> nativo.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen && !dialog.open) {
            dialog.showModal();
        } else if (!isOpen && dialog.open) {
            dialog.close();
        }
    }, [isOpen]);

    // Impede a rolagem da página ao fundo enquanto o modal está aberto.
    useEffect(() => {
        if (!isOpen) return;

        const root = document.documentElement;
        const previousOverflow = root.style.overflow;
        root.style.overflow = 'hidden';

        return () => {
            root.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    // Esc dispara "cancel"; delegamos o fechamento ao estado React.
    function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
        event.preventDefault();
        onClose();
    }

    // Um clique cujo alvo é o próprio <dialog> só acontece na área do fundo
    // (backdrop), pois todo o conteúdo fica dentro de .ui-modal__panel.
    function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }

    return (
        <dialog
            ref={dialogRef}
            className="ui-modal"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            onCancel={handleCancel}
            onClick={handleBackdropClick}
        >
            {isOpen && (
                <div className="ui-modal__panel">
                    <button
                        type="button"
                        className="ui-modal__close"
                        onClick={onClose}
                        aria-label="Fechar"
                    >
                        <Icon name="close" size={20} />
                    </button>

                    <div className="ui-modal__header">
                        {header}
                        <h2 id={titleId} className="ui-modal__title">
                            {title}
                        </h2>
                        {description && (
                            <p id={descriptionId} className="ui-modal__description">
                                {description}
                            </p>
                        )}
                    </div>

                    {children}
                </div>
            )}
        </dialog>
    );
}
