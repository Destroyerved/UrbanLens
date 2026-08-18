'use client';

import React, { useRef, useEffect, FC, ReactNode, useState } from 'react';
import gsap from 'gsap';
import { vec2 } from 'vecteur';

type Vec2 = ReturnType<typeof vec2>;

interface MagneticCursorProps {
  children: ReactNode;
  magneticFactor?: number;
  lerpAmount?: number;
  hoverPadding?: number;
  hoverAttribute?: string;
  cursorSize?: number;
  cursorColor?: string;
  blendMode?: 'difference' | 'exclusion' | 'normal' | 'screen' | 'overlay';
  cursorClassName?: string;
  disableOnTouch?: boolean;
  speedMultiplier?: number;
  maxScaleX?: number;
  maxScaleY?: number;
}

interface CursorState {
  el: HTMLDivElement | null;
  pos: {
    current: Vec2;
    target: Vec2;
    previous: Vec2;
  };
  hover: { isHovered: boolean };
  isDetaching: boolean;
}

export const MagneticCursor: FC<MagneticCursorProps> = ({
  children,
  lerpAmount = 0.14,
  magneticFactor = 0.25,
  hoverPadding = 8,
  cursorSize = 76,
  cursorColor = '#ffffff',
  blendMode = 'difference',
  cursorClassName = '',
  disableOnTouch = true,
  speedMultiplier = 0.015,
  maxScaleX = 0.15,
  maxScaleY = 0.1,
}) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorStateRef = useRef<CursorState | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const configRef = useRef({
    magneticFactor,
    speedMultiplier,
    maxScaleX,
    maxScaleY,
    cursorSize,
    lerpAmount,
    hoverPadding,
  });

  useEffect(() => {
    configRef.current = {
      magneticFactor,
      speedMultiplier,
      maxScaleX,
      maxScaleY,
      cursorSize,
      lerpAmount,
      hoverPadding,
    };
  }, [magneticFactor, speedMultiplier, maxScaleX, maxScaleY, cursorSize, lerpAmount, hoverPadding]);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (disableOnTouch && isTouchDevice) return;
    const cursorEl = cursorRef.current;
    if (!cursorEl) return;

    gsap.set(cursorEl, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0.2 });

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!cursorStateRef.current) {
      cursorStateRef.current = {
        el: cursorEl,
        pos: {
          current: vec2(-100, -100),
          target: vec2(-100, -100),
          previous: vec2(-100, -100),
        },
        hover: { isHovered: false },
        isDetaching: false,
      };
    }

    const update = () => {
      const state = cursorStateRef.current;
      if (!state || state.hover.isHovered) return;

      const { speedMultiplier, maxScaleX, maxScaleY, lerpAmount } = configRef.current;
      const effectiveLerp = prefersReducedMotion ? 1 : lerpAmount;

      state.pos.current.lerp(state.pos.target, effectiveLerp);
      const delta = state.pos.current.clone().sub(state.pos.previous);
      state.pos.previous.copy(state.pos.current);

      const speed = Math.sqrt(delta.x * delta.x + delta.y * delta.y) * speedMultiplier;
      gsap.set(state.el, {
        x: state.pos.current.x,
        y: state.pos.current.y,
        rotate: Math.atan2(delta.y, delta.x) * (180 / Math.PI),
        scaleX: 1 + Math.min(speed, maxScaleX),
        scaleY: 1 - Math.min(speed, maxScaleY),
        overwrite: 'auto',
      });
    };

    const initializePosition = (event: MouseEvent) => {
      const state = cursorStateRef.current;
      if (!state) return;
      const x = event.clientX;
      const y = event.clientY;
      state.pos.current.x = x;
      state.pos.current.y = y;
      state.pos.target.x = x;
      state.pos.target.y = y;
      state.pos.previous.x = x;
      state.pos.previous.y = y;
      gsap.set(cursorEl, { x, y });
    };

    const onMouseMove = (event: PointerEvent) => {
      const state = cursorStateRef.current;
      if (!state) return;

      state.pos.target.x = event.clientX;
      state.pos.target.y = event.clientY;

      const target = event.target as HTMLElement | null;
      const isIgnored = target
        ? Boolean(
            target.closest(
              'header, nav, footer, .ulc-nav, .ulc-footer, .ulc-copy, .ulc-tech, .ulc-tech-sm, [data-no-cursor]'
            ) || target.textContent?.trim().toUpperCase() === 'INDIA'
          )
        : false;

      // Only activate strictly on BIG display headlines and metric numbers
      const isBigHeadline =
        target && !isIgnored
          ? Boolean(
              target.closest(
                '.ulc-display, .ulc-d1, .ulc-d2, .ulc-d3, .ulc-metric, h1, h2, h3'
              ) &&
                !target.closest('.ulc-copy, .ulc-tech, .ulc-tech-sm, [data-no-cursor]') &&
                target.textContent?.trim().toUpperCase() !== 'INDIA'
            )
          : false;

      if (!isBigHeadline) {
        gsap.to(cursorEl, {
          opacity: 0,
          scale: 0.3,
          duration: 0.22,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      } else {
        const textContainer = target?.closest(
          '.ulc-display, .ulc-d1, .ulc-d2, .ulc-d3, .ulc-metric, h1, h2, h3'
        ) as HTMLElement | null;

        let dynamicWidth = cursorSize;
        let dynamicHeight = cursorSize;

        if (textContainer) {
          const rect = textContainer.getBoundingClientRect();
          const targetDim = Math.max(72, Math.min(Math.max(rect.height * 1.5, 76), 92));
          dynamicWidth = targetDim;
          dynamicHeight = targetDim;
        }

        gsap.to(cursorEl, {
          opacity: 1,
          scale: 1,
          width: dynamicWidth,
          height: dynamicHeight,
          duration: 0.28,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      }
    };

    const handleMouseLeave = () => gsap.to(cursorEl, { opacity: 0, duration: 0.2 });
    const handleMouseEnter = () => {};

    gsap.ticker.add(update);
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointermove', initializePosition, { once: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      gsap.ticker.remove(update);
      window.removeEventListener('pointermove', onMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [disableOnTouch, isTouchDevice, cursorSize]);

  if (disableOnTouch && isTouchDevice) return <>{children}</>;

  const styles: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 40,
    pointerEvents: 'none',
    willChange: 'transform, width, height, opacity',
    opacity: 0,
    width: cursorSize,
    height: cursorSize,
    borderRadius: '50%',
    backgroundColor: cursorColor,
    mixBlendMode: blendMode as any,
  };

  return (
    <>
      <div ref={cursorRef} className={`magnetic-cursor ${cursorClassName}`} style={styles} />
      {children}
    </>
  );
};

export default MagneticCursor;
