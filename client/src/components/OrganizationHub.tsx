import { useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Box, Check, ChevronDown, FolderOpen, Grid2x2, Package } from 'lucide-react';
import '../organization-v26.css';

export function InventoryStructureNav() {
    const { t } = useTranslation();
    const location = useLocation();
    const mobileSwitcherRef = useRef<HTMLDetailsElement>(null);

    const sections = [
        {
            to: '/items',
            label: t('navigation.inventory'),
            icon: Package
        },
        {
            to: '/organize/boxes',
            label: t('navigation.boxes'),
            icon: Box
        },
        {
            to: '/organize/rooms',
            label: t('navigation.rooms'),
            icon: FolderOpen
        },
        {
            to: '/organize/categories',
            label: t('navigation.categories'),
            icon: Grid2x2
        }
    ];
    const activeSection = sections.find((section) => (
        location.pathname === section.to || location.pathname.startsWith(`${section.to}/`)
    )) || sections[0];
    const ActiveSectionIcon = activeSection.icon;

    return (
        <>
            <nav className="organization-switcher-v26 organization-desktop-nav-v26" aria-label={t('navigation.inventory')}>
                <div className="organization-switcher-tabs-v26">
                    {sections.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) => `organization-switcher-tab-v26 ${isActive ? 'is-active' : ''}`}
                            title={label}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            <strong>{label}</strong>
                        </NavLink>
                    ))}
                </div>
            </nav>

            <nav className="organization-mobile-nav-v26" aria-label={t('navigation.inventory')}>
                <details ref={mobileSwitcherRef} className="organization-mobile-switcher-v26">
                    <summary>
                        <span className="organization-mobile-current-icon-v26">
                            <ActiveSectionIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="organization-mobile-current-copy-v26">
                            <small>{t('navigation.organization')}</small>
                            <strong>{activeSection.label}</strong>
                        </span>
                        <ChevronDown className="organization-mobile-chevron-v26 h-3.5 w-3.5" aria-hidden="true" />
                    </summary>
                    <div>
                        {sections.map(({ to, label, icon: Icon }) => (
                            <NavLink key={to} to={to} onClick={() => mobileSwitcherRef.current?.removeAttribute('open')}>
                                <span className="organization-mobile-choice-icon-v26">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <strong>{label}</strong>
                                {(location.pathname === to || location.pathname.startsWith(`${to}/`)) && <Check className="organization-mobile-check-v26 h-4 w-4" aria-hidden="true" />}
                            </NavLink>
                        ))}
                    </div>
                </details>
            </nav>
        </>
    );
}

export default function OrganizationHub() {
    return (
        <div className="organization-shell-v26">
            <InventoryStructureNav />
            <Outlet />
        </div>
    );
}
