import React, { useState } from 'react';

export function JsonPanel({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return <div className='card'><div className='row'><strong>{title}</strong><button onClick={()=>setOpen(!open)}>{open?'Hide':'Show'} JSON</button></div>{open && <pre>{JSON.stringify(value,null,2)}</pre>}</div>;
}
