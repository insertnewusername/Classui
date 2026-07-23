(function() {
    const HOME_TOGGLE_STORAGE_KEY = 'homeDisplayToggles';
    const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    if (prefersReducedMotion) {
        return;
    }

    const homeWidgetCursorState = new WeakMap();
    const classroomTabCursorState = new WeakMap();
    const classroomStreamCardCursorState = new WeakMap();

    let homeMovementEnabled = true;
    let wasHomePage = null;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function isHomePage() {
        return document.body.classList.contains('homebar');
    }

    function loadInitialMovementPreference() {
        try {
            const raw = localStorage.getItem(HOME_TOGGLE_STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.movement === 'boolean') {
                homeMovementEnabled = parsed.movement;
            }
        } catch (_) {}
    }

    function attachMotionState(target, stateMap) {
        const state = {
            rafId: 0,
            currentX: 0,
            currentY: 0,
            currentRotateX: 0,
            currentRotateY: 0,
            currentScale: 1,
            targetX: 0,
            targetY: 0,
            targetRotateX: 0,
            targetRotateY: 0,
            targetScale: 1,
            active: false
        };
        stateMap.set(target, state);
        return state;
    }

    function resetMotionTarget(target, stateMap) {
        const state = stateMap.get(target);
        if (state && state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = 0;
        }

        target.style.setProperty('transform', 'translate3d(0px, 0px, 0px) scale(1)', 'important');
        target.style.removeProperty('will-change');

        if (state) {
            state.currentX = 0;
            state.currentY = 0;
            state.currentRotateX = 0;
            state.currentRotateY = 0;
            state.currentScale = 1;
            state.targetX = 0;
            state.targetY = 0;
            state.targetRotateX = 0;
            state.targetRotateY = 0;
            state.targetScale = 1;
            state.active = false;
        }
    }

    function runMotionFrame(target, state, movementEasing, scaleEasing) {
        state.rafId = 0;

        if (!target.isConnected) {
            return;
        }

        state.currentX += (state.targetX - state.currentX) * movementEasing;
        state.currentY += (state.targetY - state.currentY) * movementEasing;
        state.currentRotateX += (state.targetRotateX - state.currentRotateX) * movementEasing;
        state.currentRotateY += (state.targetRotateY - state.currentRotateY) * movementEasing;
        state.currentScale += (state.targetScale - state.currentScale) * scaleEasing;

        target.style.setProperty(
            'transform',
            `translate3d(${state.currentX.toFixed(2)}px, ${state.currentY.toFixed(2)}px, 0) perspective(900px) rotateX(${state.currentRotateX.toFixed(2)}deg) rotateY(${state.currentRotateY.toFixed(2)}deg) scale(${state.currentScale.toFixed(3)})`,
            'important'
        );

        const isSettled = Math.abs(state.targetX - state.currentX) < 0.02
            && Math.abs(state.targetY - state.currentY) < 0.02
            && Math.abs(state.targetRotateX - state.currentRotateX) < 0.02
            && Math.abs(state.targetRotateY - state.currentRotateY) < 0.02
            && Math.abs(state.targetScale - state.currentScale) < 0.001;

        if (!isSettled) {
            state.rafId = requestAnimationFrame(() => runMotionFrame(target, state, movementEasing, scaleEasing));
        } else if (!state.active) {
            target.style.removeProperty('will-change');
        }
    }

    function queueFrame(target, state, movementEasing, scaleEasing) {
        if (state.rafId) {
            return;
        }
        state.rafId = requestAnimationFrame(() => runMotionFrame(target, state, movementEasing, scaleEasing));
    }

    function bindHomeWidgetCursorAttraction() {
        if (!isHomePage()) {
            return;
        }

        const cards = document.querySelectorAll('li[data-course-id][data-draggable-item-id]:not([data-mgc-cursor-attract-bound="true"])');

        cards.forEach((card) => {
            if (!card.querySelector('.ScpeUc')) {
                return;
            }

            card.dataset.mgcCursorAttractBound = 'true';
            card.style.setProperty('transform-origin', 'center center');
            card.style.setProperty('will-change', 'transform');

            const state = attachMotionState(card, homeWidgetCursorState);

            const queueUpdate = (event) => {
                if (event.pointerType === 'touch' || !isHomePage()) {
                    resetMotionTarget(card, homeWidgetCursorState);
                    return;
                }

                const rect = card.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return;
                }

                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;
                const normalizedX = clamp((pointerX / rect.width) * 2 - 1, -1, 1);
                const normalizedY = clamp((pointerY / rect.height) * 2 - 1, -1, 1);

                if (homeMovementEnabled) {
                    state.targetX = normalizedX * 14;
                    state.targetY = normalizedY * 10;
                    state.targetRotateX = -normalizedY * 5;
                    state.targetRotateY = normalizedX * 5;
                } else {
                    state.targetX = 0;
                    state.targetY = 0;
                    state.targetRotateX = 0;
                    state.targetRotateY = 0;
                }

                state.targetScale = 1.02 + (1 - Math.min(1, Math.hypot(normalizedX, normalizedY))) * 0.015;
                state.active = true;

                const movementEasing = state.active ? 0.18 : 0.12;
                const scaleEasing = state.active ? 0.28 : 0.2;
                queueFrame(card, state, movementEasing, scaleEasing);
            };

            card.addEventListener('pointerenter', queueUpdate);
            card.addEventListener('pointermove', queueUpdate);
            card.addEventListener('pointerleave', () => {
                state.targetX = 0;
                state.targetY = 0;
                state.targetRotateX = 0;
                state.targetRotateY = 0;
                state.targetScale = 1;
                state.active = false;
                queueFrame(card, state, 0.12, 0.2);
            });
            card.addEventListener('pointercancel', () => resetMotionTarget(card, homeWidgetCursorState));
            card.addEventListener('dragstart', () => resetMotionTarget(card, homeWidgetCursorState));
            card.addEventListener('dragend', () => resetMotionTarget(card, homeWidgetCursorState));
        });
    }

    function bindClassroomTabCursorAttraction() {
        const tabLinks = document.querySelectorAll('.xHPsid a.hN1OOc:not([data-mgc-tab-cursor-bound="true"])');

        tabLinks.forEach((tabLink) => {
            tabLink.dataset.mgcTabCursorBound = 'true';
            tabLink.style.setProperty('transform-origin', 'center center');
            tabLink.style.setProperty('will-change', 'transform');

            const state = attachMotionState(tabLink, classroomTabCursorState);

            const queueUpdate = (event) => {
                if (event.pointerType === 'touch') {
                    resetMotionTarget(tabLink, classroomTabCursorState);
                    return;
                }

                const rect = tabLink.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return;
                }

                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;
                const normalizedX = clamp((pointerX / rect.width) * 2 - 1, -1, 1);
                const normalizedY = clamp((pointerY / rect.height) * 2 - 1, -1, 1);

                state.targetX = normalizedX * 8;
                state.targetY = normalizedY * 5;
                state.targetRotateX = -normalizedY * 3;
                state.targetRotateY = normalizedX * 3;
                state.targetScale = 1.015 + (1 - Math.min(1, Math.hypot(normalizedX, normalizedY))) * 0.01;
                state.active = true;

                queueFrame(tabLink, state, 0.18, 0.28);
            };

            tabLink.addEventListener('pointerenter', queueUpdate);
            tabLink.addEventListener('pointermove', queueUpdate);
            tabLink.addEventListener('pointerleave', () => {
                state.targetX = 0;
                state.targetY = 0;
                state.targetRotateX = 0;
                state.targetRotateY = 0;
                state.targetScale = 1;
                state.active = false;
                queueFrame(tabLink, state, 0.12, 0.2);
            });
            tabLink.addEventListener('pointercancel', () => resetMotionTarget(tabLink, classroomTabCursorState));
        });
    }

    function bindClassroomStreamCardCursorAttraction() {
        const streamCards = document.querySelectorAll('[data-stream-item-id].wBE4bf.TIunU.xo7QFd:not([data-mgc-stream-cursor-bound="true"])');

        streamCards.forEach((card) => {
            card.dataset.mgcStreamCursorBound = 'true';
            card.style.setProperty('transform-origin', 'center center');
            card.style.setProperty('will-change', 'transform');
            card.style.setProperty('transition', 'box-shadow 0.12s ease, border-color 0.12s ease, background 0.12s ease', 'important');

            const state = attachMotionState(card, classroomStreamCardCursorState);

            const queueUpdate = (event) => {
                if (event.pointerType === 'touch') {
                    resetMotionTarget(card, classroomStreamCardCursorState);
                    return;
                }

                const rect = card.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return;
                }

                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;
                const normalizedX = clamp((pointerX / rect.width) * 2 - 1, -1, 1);
                const normalizedY = clamp((pointerY / rect.height) * 2 - 1, -1, 1);

                state.targetX = normalizedX * 10;
                state.targetY = normalizedY * 6;
                state.targetRotateX = -normalizedY * 3.5;
                state.targetRotateY = normalizedX * 3.5;
                state.targetScale = 1.02 + (1 - Math.min(1, Math.hypot(normalizedX, normalizedY))) * 0.012;
                state.active = true;

                queueFrame(card, state, 0.18, 0.28);
            };

            card.addEventListener('pointerenter', queueUpdate);
            card.addEventListener('pointermove', queueUpdate);
            card.addEventListener('pointerleave', () => {
                state.targetX = 0;
                state.targetY = 0;
                state.targetRotateX = 0;
                state.targetRotateY = 0;
                state.targetScale = 1;
                state.active = false;
                queueFrame(card, state, 0.12, 0.2);
            });
            card.addEventListener('pointercancel', () => resetMotionTarget(card, classroomStreamCardCursorState));
        });
    }

    function resetHomeCardsWhenInactive() {
        document.querySelectorAll('li[data-course-id][data-draggable-item-id][data-mgc-cursor-attract-bound="true"]').forEach((card) => {
            resetMotionTarget(card, homeWidgetCursorState);
        });
    }

    function runBindings() {
        const currentlyHome = isHomePage();

        if (currentlyHome) {
            bindHomeWidgetCursorAttraction();
        } else if (wasHomePage === true) {
            resetHomeCardsWhenInactive();
        }

        bindClassroomTabCursorAttraction();
        bindClassroomStreamCardCursorAttraction();
        wasHomePage = currentlyHome;
    }

    let bindingsScheduled = false;
    function scheduleRunBindings() {
        if (bindingsScheduled) {
            return;
        }
        bindingsScheduled = true;
        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(() => {
            bindingsScheduled = false;
            runBindings();
        });
    }

    function startBindingsObserver() {
        const root = document.body || document.documentElement;
        if (!root) {
            setTimeout(startBindingsObserver, 100);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    scheduleRunBindings();
                    return;
                }

                if (mutation.addedNodes.length || mutation.removedNodes.length) {
                    scheduleRunBindings();
                    return;
                }
            }
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    window.addEventListener('mc-home-movement-toggle-changed', (event) => {
        if (event && event.detail && typeof event.detail.enabled === 'boolean') {
            homeMovementEnabled = event.detail.enabled;
            if (!homeMovementEnabled) {
                resetHomeCardsWhenInactive();
            }
        }
    });

    loadInitialMovementPreference();
    runBindings();
    startBindingsObserver();
})();
