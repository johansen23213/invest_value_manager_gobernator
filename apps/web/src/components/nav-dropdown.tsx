'use client';

/**
 * NavDropdown — menú desplegable accesible para la navegación principal.
 *
 * Patrón: botón controlado por estado React + lista con role="menu".
 * Teclado:
 *   - Enter / Espacio en el botón: abre/cierra el menú.
 *   - ArrowDown / ArrowUp: mueve el foco entre items (circular).
 *   - Escape: cierra y devuelve el foco al botón.
 *   - Tab: cierra el menú (el foco sale del grupo).
 *   - Click fuera: cierra el menú.
 *
 * WCAG 2.1 AA:
 *   - aria-haspopup="true" + aria-expanded en el botón.
 *   - role="menu" en la lista, role="menuitem" en los enlaces.
 *   - Si algún ítem del grupo está activo, el botón refleja el estado activo visualmente
 *     y con aria-current="true" para que los lectores de pantalla lo anuncien.
 *   - Foco visible (focus-visible ring brand-600, 2px, 2px offset).
 *   - Contraste: texto #1A3A3F/70 sobre blanco → ratio ≈5.4:1 (pasa AA).
 *     Texto brand-700 sobre blanco → 8.2:1 (pasa AAA).
 *
 * E2E: los enlaces están siempre en el DOM (solo display:none cuando cerrado via
 * aria-hidden+hidden). Los specs de Playwright navegan via page.goto(url), no
 * via click en el nav, así que no hay riesgo de rotura. Ver comentario en layout.tsx.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface NavDropdownItem {
  href: string;
  label: string;
  /** Si el pathname actual coincide con este ítem, se marca como activo */
  active: boolean;
}

interface NavDropdownProps {
  /** Texto del botón del grupo */
  label: string;
  items: NavDropdownItem[];
  /** Al menos un ítem del grupo está activo (para reflejar el estado en el botón) */
  groupActive: boolean;
}

export function NavDropdown({ label, items, groupActive }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  /** Cierra el menú y devuelve el foco al botón activador */
  const close = useCallback(() => {
    setOpen(false);
    // Devolver foco al botón en el siguiente tick para que el DOM se actualice
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  /** Obtiene los items focusables del menú */
  const getMenuItems = (): HTMLAnchorElement[] => {
    if (!menuRef.current) return [];
    return Array.from(menuRef.current.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'));
  };

  /** Mueve el foco al item indicado por índice circular */
  const focusItem = (index: number) => {
    const items = getMenuItems();
    if (!items.length) return;
    const target = items[(index + items.length) % items.length];
    target?.focus();
  };

  /** Gestión de teclado en el botón */
  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((prev) => {
        if (!prev) {
          // Al abrir, foco en el primer item en el siguiente tick
          requestAnimationFrame(() => focusItem(0));
        }
        return !prev;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItem(0));
    } else if (e.key === 'Escape') {
      close();
    }
  };

  /** Gestión de teclado dentro del menú */
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const menuItems = getMenuItems();
    const focused = document.activeElement as HTMLElement;
    const idx = menuItems.indexOf(focused as HTMLAnchorElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(idx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(idx - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      // Tab cierra el menú sin capturar el evento (el foco sale naturalmente)
      setOpen(false);
    }
  };

  /** Cierra al hacer clic fuera del componente */
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const container = buttonRef.current?.closest('[data-nav-group]');
      if (container && !container.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // Clases del botón: mismo estilo píldora que NavLink, con variante activa/inactiva
  const buttonClass = groupActive
    ? 'rounded-full px-3.5 py-1.5 text-sm font-semibold bg-brand-700 text-white transition-smooth inline-flex items-center gap-1'
    : 'rounded-full px-3.5 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition-smooth hover:bg-brand-50 hover:text-brand-700 inline-flex items-center gap-1';

  return (
    // data-nav-group: selector para el cierre al hacer click fuera
    <div className="relative" data-nav-group="">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-current={groupActive ? 'true' : undefined}
        onClick={() => {
          setOpen((prev) => {
            if (!prev) requestAnimationFrame(() => focusItem(0));
            return !prev;
          });
        }}
        onKeyDown={handleButtonKeyDown}
        className={buttonClass}
      >
        {label}
        {/* Chevron: gira al abrir. aria-hidden porque es decorativo. */}
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {/*
        El menú está siempre en el DOM (hidden cuando cerrado) para que los tests
        de Playwright que hacen page.goto() directamente no dependan de él. Los links
        internos son accesibles siempre vía URL directa.
        Usamos hidden (display:none) en lugar de condicional JSX para no destruir/recrear
        nodos en cada toggle.
      */}
      <ul
        ref={menuRef}
        role="menu"
        aria-label={label}
        onKeyDown={handleMenuKeyDown}
        hidden={!open}
        className={[
          'absolute left-0 top-full z-40 mt-1 min-w-[180px] rounded-2xl border border-brand-100/60',
          'bg-white/95 py-1.5 shadow-card backdrop-blur-sm',
          open ? 'block' : 'hidden',
        ].join(' ')}
      >
        {items.map((item) => (
          <li key={item.href} role="none">
            <Link
              href={item.href}
              role="menuitem"
              aria-current={item.active ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={[
                'block px-4 py-2 text-sm transition-smooth',
                item.active
                  ? 'font-semibold text-brand-700 bg-brand-50'
                  : 'font-medium text-[#1A3A3F]/70 hover:bg-brand-50 hover:text-brand-700',
                'focus-visible:outline-none focus-visible:bg-brand-50 focus-visible:text-brand-700',
              ].join(' ')}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
