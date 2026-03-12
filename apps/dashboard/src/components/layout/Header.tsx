import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Workflow, LayoutDashboard, ExternalLink, Settings, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { getWorkflows, getAdapters, getCredentialsList } from '../../lib/api';

const NAV_ITEMS = [
  { to: '/', label: 'Workflows', icon: Workflow },
  { to: '/boards', label: 'Boards', icon: LayoutDashboard },
];

export function Header() {
  const location = useLocation();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    Promise.all([getWorkflows(), getAdapters(), getCredentialsList()])
      .then(([wf, ad, cr]) => {
        const noWorkflows = (wf.workflows || []).length === 0;
        const noTriggers = !ad.adapters?.github && !ad.adapters?.linear;
        const noCreds = (cr.credentials || []).filter(
          (c: any) => c.provider !== 'adapter'
        ).length === 0;
        setShowBanner(noWorkflows && noTriggers && noCreds);
      })
      .catch(() => {});
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <Workflow className="h-4 w-4 text-primary" />
            </div>
            <span className="hidden sm:inline lowercase font-mono tracking-tighter text-lg">consensus board</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to}>
                  <Button
                    variant={active ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn('gap-2', active && 'bg-secondary')}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <Link to="/settings">
            <Button
              variant={location.pathname === '/settings' ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('gap-2', location.pathname === '/settings' ? 'bg-secondary' : 'text-muted-foreground hover:text-foreground')}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </Link>
          <a
            href="https://github.com/consensus-tools"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open Source</span>
            </Button>
          </a>
        </div>
      </div>
      {showBanner && (
        <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Nothing is configured yet — set up your trigger adapters and API keys before running workflows.</span>
            </div>
            <Link to="/settings" className="shrink-0 text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors">
              Go to Settings
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
