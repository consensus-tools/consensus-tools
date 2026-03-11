import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { LayoutDashboard, Plus, ArrowRight } from 'lucide-react';
import { createBoard, getBoards } from '../lib/api';

export default function BoardsPage() {
  const [boards, setBoards] = useState<any[]>([]);
  const [name, setName] = useState('default');

  const load = async () => {
    try {
      const d = await getBoards();
      setBoards(d.boards || []);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-screen-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Boards</h1>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Board name"
              className="max-w-xs"
            />
            <Button
              onClick={async () => {
                try { await createBoard(name); await load(); } catch {}
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> Create Board
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boards.map((b: any) => (
          <Card key={b.id} className="group hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>{b.name}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{b.id}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()}
                </span>
                <Link to={`/boards/${b.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
                    Open <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!boards.length && (
        <div className="text-center py-12 text-muted-foreground">
          <LayoutDashboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No boards yet. Create one to get started.</p>
        </div>
      )}
    </div>
  );
}
