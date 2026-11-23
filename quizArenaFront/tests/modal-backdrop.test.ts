import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    consumeBackdropClick,
    createBackdropPointerState,
    recordBackdropPointerDown,
    recordBackdropPointerUp,
    resetBackdropPointerState,
} from '../src/components/ui/Modal/modalBackdrop.ts';

describe('Modal — Proteção contra fechamento acidental ao arrastar o ponteiro', () => {
    const dialogNode = { role: 'dialog' };
    const panelInputNode = { tag: 'input' };
    const panelCloseButtonNode = { tag: 'button', className: 'ui-modal__close' };

    it('1. pressionar dentro do modal, arrastar para o backdrop e soltar mantém o modal aberto', () => {
        const state = createBackdropPointerState();
        let closedCount = 0;

        // Sequência real do navegador ao arrastar de dentro de um input para fora no backdrop:
        // pointerdown no input (bolha até <dialog>), pointerup no <dialog>, click sintetizado no ancestral comum (<dialog>).
        recordBackdropPointerDown(state, {
            target: panelInputNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        recordBackdropPointerUp(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        if (
            consumeBackdropClick(state, {
                target: dialogNode,
                currentTarget: dialogNode,
            })
        ) {
            closedCount += 1;
        }

        assert.equal(closedCount, 0);
        assert.deepEqual(state, { startedOnBackdrop: false, endedOnBackdrop: false });
    });

    it('2. pressionar no backdrop, arrastar para dentro do modal e soltar mantém o modal aberto', () => {
        const state = createBackdropPointerState();
        let closedCount = 0;

        recordBackdropPointerDown(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        recordBackdropPointerUp(state, {
            target: panelInputNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        // Mesmo que o navegador sintetize o click no ancestral comum (<dialog>), não deve fechar
        if (
            consumeBackdropClick(state, {
                target: dialogNode,
                currentTarget: dialogNode,
            })
        ) {
            closedCount += 1;
        }

        assert.equal(closedCount, 0);
        assert.deepEqual(state, { startedOnBackdrop: false, endedOnBackdrop: false });
    });

    it('3. clique real diretamente no backdrop fecha o modal e reseta a referência após o uso', () => {
        const state = createBackdropPointerState();
        let closedCount = 0;

        recordBackdropPointerDown(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        recordBackdropPointerUp(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        if (
            consumeBackdropClick(state, {
                target: dialogNode,
                currentTarget: dialogNode,
            })
        ) {
            closedCount += 1;
        }

        assert.equal(closedCount, 1);
        assert.deepEqual(state, { startedOnBackdrop: false, endedOnBackdrop: false });

        // Um click subsequente sem novo pointerdown no backdrop não deve disparar fechamento duplicado
        assert.equal(
            consumeBackdropClick(state, {
                target: dialogNode,
                currentTarget: dialogNode,
            }),
            false,
        );
    });

    it('4 e 6. clique em botão interno não aciona o fechamento por backdrop e interações internas permanecem preservadas', () => {
        const state = createBackdropPointerState();

        recordBackdropPointerDown(state, {
            target: panelCloseButtonNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        recordBackdropPointerUp(state, {
            target: panelCloseButtonNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });

        assert.equal(
            consumeBackdropClick(state, {
                target: panelCloseButtonNode,
                currentTarget: dialogNode,
            }),
            false,
        );

        // Clique com botão direito no backdrop não fecha o modal
        recordBackdropPointerDown(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 2,
            isPrimary: true,
        });
        recordBackdropPointerUp(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 2,
            isPrimary: true,
        });
        assert.equal(
            consumeBackdropClick(state, {
                target: dialogNode,
                currentTarget: dialogNode,
            }),
            false,
        );
    });

    it('reseta o estado quando o ponteiro é cancelado ou quando o modal é fechado/cancelado via Esc', () => {
        const state = createBackdropPointerState();

        recordBackdropPointerDown(state, {
            target: dialogNode,
            currentTarget: dialogNode,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
        });
        assert.equal(state.startedOnBackdrop, true);

        resetBackdropPointerState(state);
        assert.deepEqual(state, { startedOnBackdrop: false, endedOnBackdrop: false });

        assert.equal(
            consumeBackdropClick(state, {
                target: dialogNode,
                currentTarget: dialogNode,
            }),
            false,
        );
    });

    it('5. Modal.tsx utiliza useRef, onPointerDown/onPointerUp/onPointerCancel (sem duplicar com mouse events) e preserva botão fechar e Esc', () => {
        const modalSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/components/ui/Modal/Modal.tsx'),
            'utf8',
        );

        assert.match(modalSource, /useRef<BackdropPointerState>/);
        assert.match(modalSource, /onPointerDown=\{handleBackdropPointerDown\}/);
        assert.match(modalSource, /onPointerUp=\{handleBackdropPointerUp\}/);
        assert.match(modalSource, /onPointerCancel=\{handleBackdropPointerCancel\}/);
        assert.match(modalSource, /onClick=\{handleBackdropClick\}/);
        assert.match(modalSource, /onCancel=\{handleCancel\}/);
        assert.match(modalSource, /className="ui-modal__close"[\s\S]*?onClick=\{onClose\}/);
        assert.match(modalSource, /resetBackdropPointerState/);

        // Evita duplicidade entre eventos de mouse e pointer
        assert.doesNotMatch(modalSource, /onMouseDown|onMouseUp/);
    });
});
