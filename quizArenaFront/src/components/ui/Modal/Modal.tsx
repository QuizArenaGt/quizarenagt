import {
    useEffect,
    useId,
    useRef,
    type MouseEvent,
    type PointerEvent,
    type ReactNode,
    type SyntheticEvent,
} from 'react';
import Icon from '../Icon/Icon';
import {
    consumeBackdropClick,
    createBackdropPointerState,
    recordBackdropPointerDown,
    recordBackdropPointerUp,
    resetBackdropPointerState,
    type BackdropPointerState,
} from './modalBackdrop.ts';
import './Modal.css';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    /** Conteúdo exibido acima do título (ex.: logotipo). */
    header?: ReactNode;
    /** "md" para diálogos simples; "lg" para formulários maiores. */
    size?: 'md' | 'lg';
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
export default function Modal({ isOpen, onClose, title, description, header, size = 'md', children }: ModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const backdropPointerStateRef = useRef<BackdropPointerState>(createBackdropPointerState());
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

        if (!isOpen) {
            resetBackdropPointerState(backdropPointerStateRef.current);
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
        resetBackdropPointerState(backdropPointerStateRef.current);
        onClose();
    }

    function handleBackdropPointerDown(event: PointerEvent<HTMLDialogElement>) {
        recordBackdropPointerDown(backdropPointerStateRef.current, event);
    }

    function handleBackdropPointerUp(event: PointerEvent<HTMLDialogElement>) {
        recordBackdropPointerUp(backdropPointerStateRef.current, event);
    }

    function handleBackdropPointerCancel() {
        resetBackdropPointerState(backdropPointerStateRef.current);
    }

    // Fecha apenas quando pressionamento inicial, liberação e clique aconteceram
    // diretamente no <dialog> (backdrop), impedindo fechamento após arrastes.
    function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
        if (consumeBackdropClick(backdropPointerStateRef.current, event)) {
            onClose();
        }
    }

    return (
        <dialog
            ref={dialogRef}
            className={`ui-modal ui-modal--${size}`}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            onCancel={handleCancel}
            onPointerDown={handleBackdropPointerDown}
            onPointerUp={handleBackdropPointerUp}
            onPointerCancel={handleBackdropPointerCancel}
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
