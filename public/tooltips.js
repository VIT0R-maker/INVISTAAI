const TRIGGER_SELECTOR = '.help-icon, .status-badge';
let controller;

/** Coordinates use the layout viewport, including a zoomed visual viewport's offset. */
export function tooltipPosition(anchor, size, viewport, padding = 12, gap = 10) {
    const availableWidth = Math.max(1, viewport.width - padding * 2);
    const availableHeight = Math.max(1, viewport.height - padding * 2);
    const leftEdge = (viewport.left || 0) + padding;
    const topEdge = (viewport.top || 0) + padding;
    const rightEdge = leftEdge + availableWidth;
    const bottomEdge = topEdge + availableHeight;
    const width = Math.min(size.width, availableWidth);
    const above = Math.max(0, anchor.top - gap - topEdge);
    const below = Math.max(0, bottomEdge - anchor.bottom - gap);
    const placement = size.height <= above ? 'above'
        : size.height <= below ? 'below'
            : above >= below ? 'above' : 'below';
    const available = placement === 'above' ? above : below;
    const maxHeight = Math.max(1, Math.min(available || availableHeight, availableHeight));
    const height = Math.min(size.height, maxHeight);
    const center = anchor.left + anchor.width / 2;
    const left = Math.max(leftEdge, Math.min(center - width / 2, rightEdge - width));
    const desiredTop = placement === 'above' ? anchor.top - gap - height : anchor.bottom + gap;
    const top = Math.max(topEdge, Math.min(desiredTop, bottomEdge - height));
    const arrowInset = Math.min(16, width / 2);
    return {
        left, top, width, maxHeight, placement,
        arrowLeft: Math.max(arrowInset, Math.min(center - left, width - arrowInset)),
    };
}

export function hideTooltips() {
    controller?.hide();
}

/** Delegation also covers indicator cards added by later searches and profile changes. */
export function initTooltips() {
    if (controller) return controller.destroy;

    const tooltip = document.createElement('div');
    tooltip.className = 'indicator-tooltip';
    tooltip.id = 'indicator-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    const content = document.createElement('div');
    content.className = 'indicator-tooltip-content';
    tooltip.append(content);
    document.body.append(tooltip);
    document.documentElement.classList.add('tooltips-enhanced');

    let trigger = null;
    let pinned = false;
    let previousDescription = null;
    let hideTimer;
    let frame;
    let pointerTrigger = null;
    let pointerAt = 0;
    const removers = [];
    const listen = (target, event, handler, options) => {
        target.addEventListener(event, handler, options);
        removers.push(() => target.removeEventListener(event, handler, options));
    };
    const triggerFrom = (target) => target instanceof Element ? target.closest(TRIGGER_SELECTOR) : null;
    const contains = (parent, target) => target instanceof Node && parent?.contains(target);
    const viewport = () => {
        const view = window.visualViewport;
        return {
            left: view?.offsetLeft || 0, top: view?.offsetTop || 0,
            width: view?.width || window.innerWidth, height: view?.height || window.innerHeight,
        };
    };

    function hide() {
        clearTimeout(hideTimer);
        cancelAnimationFrame(frame);
        frame = null;
        if (trigger) {
            if (previousDescription === null) trigger.removeAttribute('aria-describedby');
            else trigger.setAttribute('aria-describedby', previousDescription);
            trigger.setAttribute('aria-expanded', 'false');
        }
        trigger = null;
        pinned = false;
        previousDescription = null;
        tooltip.hidden = true;
        content.replaceChildren();
    }

    function place() {
        frame = null;
        if (!trigger?.isConnected) return hide();
        const bounds = trigger.getBoundingClientRect();
        const view = viewport();
        if (bounds.bottom <= view.top || bounds.top >= view.top + view.height
            || bounds.right <= view.left || bounds.left >= view.left + view.width) return hide();

        tooltip.style.width = `${Math.min(340, Math.max(1, view.width - 24))}px`;
        content.style.maxHeight = `${Math.max(1, view.height - 24)}px`;
        const naturalHeight = content.scrollHeight;
        const position = tooltipPosition(bounds, {
            width: tooltip.getBoundingClientRect().width, height: naturalHeight,
        }, view);
        tooltip.style.left = `${position.left}px`;
        tooltip.style.top = `${position.top}px`;
        tooltip.style.setProperty('--tooltip-arrow-left', `${position.arrowLeft}px`);
        tooltip.dataset.placement = position.placement;
        content.style.maxHeight = `${position.maxHeight}px`;
        // A long explanation can be focused and scrolled using the keyboard too.
        content.tabIndex = naturalHeight > position.maxHeight ? 0 : -1;
    }

    function schedulePlace() {
        if (trigger && !frame) frame = requestAnimationFrame(place);
    }

    function show(next, shouldPin = false) {
        const source = next?.querySelector('.help-tooltip');
        if (!source?.textContent.trim()) return;
        clearTimeout(hideTimer);
        if (trigger === next) {
            pinned ||= shouldPin;
            schedulePlace();
            return;
        }
        hide();
        trigger = next;
        pinned = shouldPin;
        previousDescription = trigger.getAttribute('aria-describedby');
        trigger.setAttribute('aria-describedby', [...new Set([
            ...(previousDescription || '').split(/\s+/).filter(Boolean), tooltip.id,
        ])].join(' '));
        trigger.setAttribute('aria-expanded', 'true');

        // Copy text and line breaks only; content never becomes executable markup.
        const sourceCopy = source.cloneNode(true);
        sourceCopy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        content.textContent = sourceCopy.textContent.trim();
        content.scrollTop = 0;
        tooltip.hidden = false;
        place();
    }

    function scheduleHide() {
        if (!pinned) hideTimer = setTimeout(hide, 140);
    }

    listen(document, 'pointerdown', (event) => {
        pointerTrigger = triggerFrom(event.target);
        pointerAt = performance.now();
        if (!pointerTrigger && !contains(tooltip, event.target)) hide();
    }, true);
    listen(document, 'click', (event) => {
        const next = triggerFrom(event.target);
        if (!next?.querySelector('.help-tooltip')) return;
        event.preventDefault();
        if (trigger === next && pinned) hide();
        else show(next, true);
    });
    listen(document, 'pointerover', (event) => {
        if (event.pointerType === 'touch') return;
        if (contains(tooltip, event.target)) return clearTimeout(hideTimer);
        const next = triggerFrom(event.target);
        if (next && !contains(next, event.relatedTarget)) show(next);
    });
    listen(document, 'pointerout', (event) => {
        if (event.pointerType === 'touch' || !trigger) return;
        if (contains(trigger, event.relatedTarget) || contains(tooltip, event.relatedTarget)) return;
        if (contains(trigger, event.target) || contains(tooltip, event.target)) scheduleHide();
    });
    listen(document, 'focusin', (event) => {
        const next = triggerFrom(event.target);
        // Pointer focus precedes click; letting click handle it avoids a touch double-toggle.
        if (next && !(next === pointerTrigger && performance.now() - pointerAt < 1000)) show(next, true);
    });
    listen(document, 'focusout', (event) => {
        if ((contains(trigger, event.target) || contains(tooltip, event.target))
            && !contains(trigger, event.relatedTarget) && !contains(tooltip, event.relatedTarget)) hide();
    });
    listen(document, 'keydown', (event) => {
        if (event.key === 'Escape') return hide();
        const next = triggerFrom(event.target);
        if (next && next.tagName !== 'BUTTON' && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            if (trigger === next && pinned) hide();
            else show(next, true);
        }
    });
    listen(window, 'resize', schedulePlace);
    listen(document, 'scroll', schedulePlace, true);
    if (window.visualViewport) {
        listen(window.visualViewport, 'resize', schedulePlace);
        listen(window.visualViewport, 'scroll', schedulePlace);
    }
    const observer = new MutationObserver(() => {
        if (trigger && !trigger.isConnected) hide();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function destroy() {
        hide();
        observer.disconnect();
        removers.forEach((remove) => remove());
        tooltip.remove();
        document.documentElement.classList.remove('tooltips-enhanced');
        controller = null;
    }
    controller = { hide, destroy };
    return destroy;
}
