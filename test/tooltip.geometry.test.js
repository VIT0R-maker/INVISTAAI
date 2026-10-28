import test from 'node:test';
import assert from 'node:assert/strict';
import { tooltipPosition } from '../public/tooltips.js';

const viewport = { left: 0, top: 0, width: 320, height: 640 };
const anchor = (left, top, width = 20) => ({ left, top, width, right: left + width, bottom: top + 20 });

test('tooltip remains within both horizontal edges of a 320px phone viewport', () => {
    for (const left of [0, 10, 150, 290, 300]) {
        const position = tooltipPosition(anchor(left, 360), { width: 340, height: 150 }, viewport);
        assert.ok(position.left >= 12);
        assert.ok(position.left + position.width <= 308);
        assert.ok(position.top >= 12);
        assert.ok(position.top + 150 <= 628);
        assert.equal(position.placement, 'above');
        assert.ok(position.arrowLeft >= 16 && position.arrowLeft <= position.width - 16);
    }
});

test('tooltip flips below when there is not enough space above the indicator', () => {
    const position = tooltipPosition(anchor(120, 20), { width: 270, height: 100 }, viewport);
    assert.equal(position.placement, 'below');
    assert.equal(position.top, 50);
});

test('tooltip respects the visual viewport position while zoomed or using the keyboard', () => {
    const view = { left: 24, top: 100, width: 280, height: 420 };
    const position = tooltipPosition(anchor(30, 250), { width: 340, height: 120 }, view);
    assert.ok(position.left >= 36);
    assert.ok(position.left + position.width <= 292);
    assert.ok(position.top >= 112);
    assert.ok(position.top + 120 <= 508);
});

test('long explanations use the larger available side and a bounded scroll area', () => {
    const position = tooltipPosition(anchor(150, 300), { width: 340, height: 1000 }, viewport);
    assert.equal(position.placement, 'below');
    assert.equal(position.maxHeight, 298);
    assert.ok(position.top >= 12);
    assert.ok(position.top + position.maxHeight <= 628);
});

test('tooltip fits a short landscape viewport even when neither side fits all content', () => {
    const position = tooltipPosition(anchor(150, 120), { width: 270, height: 180 }, {
        ...viewport, height: 240,
    });
    assert.equal(position.placement, 'above');
    assert.equal(position.maxHeight, 98);
    assert.ok(position.top >= 12);
    assert.ok(position.top + position.maxHeight <= 228);
});
