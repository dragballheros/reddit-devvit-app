import { showForm, showToast } from '@devvit/web/client';
import { useEffect, useRef, useState } from 'react';
import './admin.css';
import { getDefaultAdminConfig, type AdminConfig, type ManagedButton, type ManagedButtonType, type ManagedAsset } from '../shared/subreddit';

type TargetRecord = { subredditName: string; postId: string };
const api = async <T,>(url: string, options?: RequestInit): Promise<T> => { const response = await fetch(url, options); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Request failed.'); return body as T; };
const cloneDefault = (): AdminConfig => JSON.parse(JSON.stringify(getDefaultAdminConfig())) as AdminConfig;

const BackgroundEditor = ({ button, onChange }: { button: ManagedButton; onChange: (patch: Partial<ManagedButton>) => void }) => {
  const start = useRef<{ x: number; y: number; scale: number; sx: number; sy: number } | null>(null);
  const beginResize = (event: React.PointerEvent<HTMLSpanElement>, sx: number, sy: number) => {
    event.preventDefault();
    event.stopPropagation();
    start.current = { x: event.clientX, y: event.clientY, scale: button.backgroundScale ?? 1, sx, sy };
    const move = (next: PointerEvent) => {
      if (!start.current) return;
      const dx = (next.clientX - start.current.x) * start.current.sx;
      const dy = (next.clientY - start.current.y) * start.current.sy;
      const nextScale = Math.min(3, Math.max(0.5, start.current.scale + (dx + dy) / 260));
      onChange({ backgroundScale: Number(nextScale.toFixed(2)) });
    };
    const end = () => {
      start.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  return <div className="fit-preview" style={{ backgroundImage: button.background ? `url("${button.background}")` : button.backgroundGradient, backgroundPosition: `${button.backgroundPositionX ?? 50}% ${button.backgroundPositionY ?? 50}%`, backgroundSize: button.background ? `${(button.backgroundScale ?? 1) * 100}% auto` : '220% 220%' }}>
    <span>{button.label}</span>
    <span className="resize-handle resize-handle--tl" onPointerDown={(e) => beginResize(e, 1, 1)} />
    <span className="resize-handle resize-handle--tr" onPointerDown={(e) => beginResize(e, -1, 1)} />
    <span className="resize-handle resize-handle--bl" onPointerDown={(e) => beginResize(e, 1, -1)} />
    <span className="resize-handle resize-handle--br" onPointerDown={(e) => beginResize(e, -1, -1)} />
  </div>;
};

export const AdminApp = () => {
  const [config, setConfig] = useState<AdminConfig>(cloneDefault());
  const [targets, setTargets] = useState<TargetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSubreddit, setNewSubreddit] = useState('');

  useEffect(() => {
    api<{ config: AdminConfig; targets: TargetRecord[] }>('/api/admin/config')
      .then((data) => { setConfig(data.config); setTargets(data.targets ?? []); })
      .catch((error) => showToast(error instanceof Error ? error.message : 'Failed to load admin panel.'))
      .finally(() => setLoading(false));
  }, []);

  const updateButton = (id: string, patch: Partial<ManagedButton>) =>
    setConfig((current) => ({ ...current, buttons: current.buttons.map((button) => button.id === id ? { ...button, ...patch } : button) }));

  const addButton = () => setConfig((current) => ({
    ...current,
    buttons: [...current.buttons, { id: `button-${Date.now()}`, label: 'New Button', type: 'external', accent: '#b18cff', backgroundGradient: 'linear-gradient(120deg,#1b1b2f,#3d2c63,#090a12)', enabled: true }],
  }));

  const uploadMedia = async (kind: 'welcome'|'background'|'icon', buttonId?: string) => {
    const result = await showForm({ form: { title: kind === 'welcome' ? 'Upload Welcome GIF' : kind === 'background' ? 'Upload Button Background' : 'Upload Button Icon', fields: [{ type: 'string', name: 'name', label: 'Asset name', required: true }, { type: 'image', name: 'media', label: 'Image or GIF', required: true, helpText: 'Reddit-hosted uploads are limited to 20 MB.' }] } });
    if (!result?.media) return;
    const url = result.media as string;
    const asset: ManagedAsset = { id: `asset-${Date.now()}`, name: String(result.name ?? 'Uploaded asset'), url, type: kind === 'welcome' ? 'gif' : 'image' };
    setConfig((current) => ({
      ...current,
      assets: [...current.assets, asset],
      ...(kind === 'welcome'
        ? {
            welcomeGif: current.welcomeGifVariants?.[0] ?? current.welcomeGif,
            welcomeGifVariants: [...(current.welcomeGifVariants ?? (current.welcomeGif ? [current.welcomeGif] : [])), url],
          }
        : {}),
    }));
    if (buttonId) updateButton(buttonId, kind === 'background' ? { background: url } : { icon: url });
  };

  const addSubreddit = () => {
    const normalized = newSubreddit.trim().replace(/^r\//i, '');
    if (!normalized) return;
    setConfig((current) => current.managedSubreddits.includes(normalized) ? current : { ...current, managedSubreddits: [...current.managedSubreddits, normalized] });
    setNewSubreddit('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = await api<{ config: AdminConfig; targets: TargetRecord[]; results: Array<{ subredditName: string; status: string; error?: string }> }>('/api/admin/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }) });
      setConfig(data.config); setTargets(data.targets ?? []);
      const failed = data.results.filter((item) => !['created','updated'].includes(item.status));
      showToast(failed.length ? `Saved. ${failed.length} subreddit(s) need installation or permission.` : 'Saved and applied to selected subreddits.');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setSaving(false); }
  };

  const removeButton = (id: string) => setConfig((current) => ({ ...current, buttons: current.buttons.filter((button) => button.id !== id) }));

  if (loading) return <main className="admin"><div className="panel"><h1>AnimeH34 Admin</h1><p>Loading configuration…</p></div></main>;

  return <main className="admin"><div className="panel">
    <header className="hero"><div><p className="eyebrow">Moderator Configuration</p><h1>AnimeH34 Admin</h1><p className="muted">Configure the portal once, then apply it to multiple subreddit posts.</p></div><button className="primary" onClick={save} disabled={saving}>{saving?'Applying…':'Save & Apply'}</button></header>
    <section className="section"><div className="section-title"><h2>Welcome Screen</h2><span>{(config.welcomeGifVariants?.length ?? (config.welcomeGif ? 1 : 0))} GIF{(config.welcomeGifVariants?.length ?? (config.welcomeGif ? 1 : 0)) === 1 ? '' : 's'}</span></div><div className="upload-row"><div className="welcome-gif-grid">{(config.welcomeGifVariants?.length ? config.welcomeGifVariants : config.welcomeGif ? [config.welcomeGif] : []).map((url, index)=><div className="welcome-gif-card" key={url + index}><img src={url} className="preview-gif" alt={`Welcome GIF ${index + 1}`}/><button className="ghost" onClick={()=>setConfig((c)=>{const variants=(c.welcomeGifVariants?.length ? c.welcomeGifVariants : c.welcomeGif ? [c.welcomeGif] : []).filter((_,i)=>i!==index); return {...c,welcomeGif:variants[0],welcomeGifVariants:variants};})}>Remove</button></div>)}{!(config.welcomeGifVariants?.length || config.welcomeGif) && <div className="empty-preview">Bundled welcome GIF</div>}</div><div><button className="secondary" onClick={()=>uploadMedia('welcome')}>Add Welcome GIF</button>{(config.welcomeGifVariants?.length || config.welcomeGif)&&<button className="ghost" onClick={()=>setConfig((c)=>({...c,welcomeGif:undefined,welcomeGifVariants:[]}))}>Use Bundled GIFs</button>}<p className="hint">Add multiple GIFs. A different GIF is selected randomly each time the post loads or refreshes.</p></div></div></section>
    <section className="section"><div className="section-title"><h2>Managed Subreddits</h2><span>{config.managedSubreddits.length} selected</span></div><div className="sub-add"><input value={newSubreddit} onChange={(e)=>setNewSubreddit(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&addSubreddit()} placeholder="Subreddit name, e.g. AnimeH34"/><button className="secondary" onClick={addSubreddit}>Add</button></div><div className="chips">{config.managedSubreddits.map((name)=><button key={name} className="chip" onClick={()=>setConfig((c)=>({...c,managedSubreddits:c.managedSubreddits.filter((item)=>item!==name)}))}>r/{name} ×</button>)}</div><p className="hint">The app must be installed in each selected subreddit and you must be a moderator there. Save creates missing portal posts and updates existing managed posts.</p><div className="targets">{targets.map((target)=><div key={target.postId} className="target"><span>r/{target.subredditName}</span><small>{target.postId}</small></div>)}</div></section>
    <section className="section"><div className="section-title"><h2>Asset Library</h2><span>{config.assets.length} reusable assets</span></div><div className="asset-grid">{config.assets.map((asset)=><div className="asset-card" key={asset.id}><img src={asset.url} alt="" /><div><strong>{asset.name}</strong><small>{asset.type}</small></div></div>)}</div><p className="hint">Uploads are stored as Reddit-hosted media URLs. Reusing an asset does not upload another copy.</p></section><section className="section"><div className="section-title"><h2>Portal Buttons</h2><button className="secondary" onClick={addButton}>+ Add Button</button></div><div className="buttons">{config.buttons.map((button,index)=><article className="button-card" key={button.id}><div className="button-head"><strong>{index+1}. {button.label}</strong><button className="danger" onClick={()=>removeButton(button.id)}>Remove</button></div><div className="fields"><label>Label<input value={button.label} onChange={(e)=>updateButton(button.id,{label:e.target.value})}/></label><label>Type<select value={button.type} onChange={(e)=>updateButton(button.id,{type:e.target.value as ManagedButtonType})}><option value="subreddit">Subreddit</option><option value="discord">Discord</option><option value="modmail">Modmail</option><option value="external">Custom Link</option></select></label>{button.type!=='modmail'&&<label className="wide">Destination URL<input value={button.url??''} onChange={(e)=>updateButton(button.id,{url:e.target.value})} placeholder="https://www.reddit.com/r/..."/></label>}<label>Accent<input value={button.accent??'#ffffff'} onChange={(e)=>updateButton(button.id,{accent:e.target.value})}/></label><label>Gradient<input value={button.backgroundGradient??''} onChange={(e)=>updateButton(button.id,{backgroundGradient:e.target.value})} placeholder="linear-gradient(...)"/></label></div><div className="media-row"><button className="secondary" onClick={()=>uploadMedia('background',button.id)}>Upload Background</button><button className="secondary" onClick={()=>uploadMedia('icon',button.id)}>Upload Icon</button><label>Existing Background<select value={button.background??''} onChange={(e)=>updateButton(button.id,{background:e.target.value||undefined})}><option value="">None</option>{config.assets.map((asset)=><option key={asset.id} value={asset.url}>{asset.name}</option>)}</select></label><label>Existing Icon<select value={button.icon??''} onChange={(e)=>updateButton(button.id,{icon:e.target.value||undefined})}><option value="">None</option>{config.assets.map((asset)=><option key={asset.id} value={asset.url}>{asset.name}</option>)}</select></label>{button.background&&<img src={button.background} className="thumb" alt=""/>}{button.icon&&<img src={button.icon} className="thumb icon-thumb" alt=""/>}</div><div className="transform"><div className="section-title"><h3>Background Fit</h3><span>Automatic cover + manual override</span></div><div className="fields"><label>Position X<input type="number" min="0" max="100" value={button.backgroundPositionX??50} onChange={(e)=>updateButton(button.id,{backgroundPositionX:Number(e.target.value)})}/></label><label>Position Y<input type="number" min="0" max="100" value={button.backgroundPositionY??50} onChange={(e)=>updateButton(button.id,{backgroundPositionY:Number(e.target.value)})}/></label><label>Scale<input type="number" min="0.5" max="3" step="0.05" value={button.backgroundScale??1} onChange={(e)=>updateButton(button.id,{backgroundScale:Number(e.target.value)})}/></label></div><BackgroundEditor button={button} onChange={(patch) => updateButton(button.id, patch)} /><p className="hint">The button frame stays fixed. X/Y move the image inside it and Scale resizes the background.</p></div></article>)}</div></section>
    <footer className="footer"><button className="primary" onClick={save} disabled={saving}>{saving?'Applying…':'Save & Apply to Existing Posts'}</button><p>The three-dot Create HentaiApp Post remains separate for review/testing and creates an independent post.</p></footer>
  </div></main>;
};
