import {useEffect,useRef,useState} from 'react';
import {COVER_H,COVER_W,LOW_RES_WIDTH,UPPER,coverJpeg,cropRect,enhance,type Crop} from './coverCrop';

type Store={savePhoto(b:Blob):Promise<void>;removePhoto():Promise<void>;publishPhoto?(b:Blob):Promise<void>;unpublishPhoto?():Promise<void>};
const btn:React.CSSProperties={minHeight:44,padding:'0 16px',borderRadius:999,border:0,font:'inherit',fontWeight:700,cursor:'pointer'};
const ghost:React.CSSProperties={...btn,background:'rgba(6,20,13,.7)',color:'#F1F4EA'};
const ball:React.CSSProperties={...btn,background:'var(--ball,#D9F24A)',color:'#06140D'};

/** Athlete Cover photo: choose, crop (zoom and move) and save the player's own private photo. */
export function CoverEditor({store,hasPhoto,onSaved,canPublish=false}:{store:Store;hasPhoto:boolean;onSaved:()=>void;canPublish?:boolean}){
 const[bitmap,setBitmap]=useState<ImageBitmap|null>(null);
 const[crop,setCrop]=useState<Crop>(UPPER);
 const[enhanced,setEnhanced]=useState(true);
 const[busy,setBusy]=useState(false);
 const[msg,setMsg]=useState('');
 const[publish,setPublish]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{const c=canvas.current;if(!c||!bitmap)return;const ctx=c.getContext('2d');if(!ctx)return;const r=cropRect(bitmap.width,bitmap.height,crop);ctx.drawImage(bitmap,r.sx,r.sy,r.sw,r.sh,0,0,c.width,c.height);if(enhanced){const img=ctx.getImageData(0,0,c.width,c.height);enhance(img.data,c.width,c.height);ctx.putImageData(img,0,0);}},[bitmap,crop,enhanced]);
 const small=!!bitmap&&cropRect(bitmap.width,bitmap.height,crop).sw<LOW_RES_WIDTH;
 const pick=async(file?:File)=>{setMsg('');if(!file)return;
  if(!/^image\//i.test(file.type)){setMsg('Choose a photo (JPEG, PNG or WebP).');return;}
  try{setBitmap(await createImageBitmap(file));setCrop(UPPER);setEnhanced(true);setPublish(false);}catch{setMsg('That photo can’t be opened here. Try a JPEG or PNG.');}};
 const save=async()=>{if(!bitmap)return;setBusy(true);setMsg('');
  try{const image=await coverJpeg(bitmap,crop,enhanced);await store.savePhoto(image);
   if(publish)await store.publishPhoto?.(image);bitmap.close?.();setBitmap(null);setMsg('Photo saved ✓');onSaved();}
  catch(e){setMsg(e instanceof Error?e.message:'Could not save the photo.');}finally{setBusy(false);}};
 const remove=async()=>{setBusy(true);setMsg('');try{await store.unpublishPhoto?.();await store.removePhoto();setMsg('Photo removed');onSaved();}catch(e){setMsg(e instanceof Error?e.message:'Could not remove the photo.');}finally{setBusy(false);}};
 const slider=(label:string,k:keyof Crop,min:number,max:number)=><label style={{display:'grid',gridTemplateColumns:'92px minmax(0,1fr)',alignItems:'center',gap:8,minHeight:44,fontSize:14,fontWeight:700}}>{label}
  <input type="range" aria-label={label} min={min} max={max} step={0.01} value={crop[k]} onChange={e=>setCrop({...crop,[k]:Number(e.target.value)})} style={{width:'100%',minHeight:44,accentColor:'#D9F24A'}}/></label>;
 return <div className="rq-cover-edit" style={{display:'flex',flexDirection:'column',gap:8,marginTop:10}}>
  {!bitmap&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button type="button" style={ball} onClick={()=>fileInput.current?.click()}>{hasPhoto?'Edit photo':'Add my photo'}</button>
    <input ref={fileInput} type="file" accept="image/*" aria-label={hasPhoto?'Edit photo':'Add my photo'} onChange={e=>{void pick(e.target.files?.[0]);e.target.value='';}} style={{position:'absolute',width:1,height:1,opacity:0,overflow:'hidden',fontSize:16}} tabIndex={-1}/>
   {hasPhoto&&<details className="studio-photo-options"><summary>Photo options</summary>
   {store.unpublishPhoto&&<button type="button" style={ghost} disabled={busy} onClick={async()=>{
    setBusy(true);
    try{await store.unpublishPhoto?.();setMsg('Public photo removed.');}catch(e){setMsg(e instanceof Error?e.message:'Could not remove the public photo.');}finally{setBusy(false);}
   }}>Remove public photo</button>}
   <button type="button" style={ghost} disabled={busy} onClick={()=>{void remove();}}>Remove photo</button></details>}
  </div>}
  {bitmap&&<div role="group" aria-label="Crop your photo" style={{background:'rgba(6,20,13,.82)',borderRadius:18,padding:12,display:'flex',flexDirection:'column',gap:4,maxWidth:360}}>
   <canvas ref={canvas} width={COVER_W/5} height={COVER_H/5} aria-label="Cover preview" style={{width:144,height:180,borderRadius:12,alignSelf:'center'}}/>
   <div style={{display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap'}} role="group" aria-label="Photo look">
    <button type="button" aria-pressed={enhanced} style={enhanced?ball:ghost} onClick={()=>setEnhanced(true)}>Enhanced</button>
    <button type="button" aria-pressed={!enhanced} style={!enhanced?ball:ghost} onClick={()=>setEnhanced(false)}>Keep original</button>
   </div>
   {small&&<span role="note" style={{fontSize:13,color:'#E8C35A'}}>This photo is small, so the cover may look a little soft. You can still use it, or zoom out.</span>}
   {slider('Zoom','zoom',1,3)}{slider('Left–right','x',0,1)}{slider('Up–down','y',0,1)}
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
    <button type="button" style={ball} disabled={busy} onClick={()=>{void save();}}>{busy?'Saving…':'Save photo'}</button>
    <button type="button" style={ghost} disabled={busy} onClick={()=>{bitmap.close?.();setBitmap(null);}}>Cancel</button>
   </div>
   {canPublish&&<label style={{display:'flex',alignItems:'center',gap:8,minHeight:44}}>
    <input type="checkbox" checked={publish} onChange={event=>setPublish(event.target.checked)}/> Also use this photo on my public profile
   </label>}
   <span style={{fontSize:12,color:'#C9D6CD'}}>{publish?'This photo will also appear on your public profile.':'Only you can see the photo you save here.'}</span>
  </div>}
  {msg&&<span role="status" style={{fontSize:14,fontWeight:700}}>{msg}</span>}
 </div>;
}
