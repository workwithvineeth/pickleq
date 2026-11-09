export type SkinChoice='court'|'axis'|'maroon';
export const SKIN_KEY='pq-skin';
export const SKINS={
 court:{name:'Court Green',brand:'#D9F24A',brandHi:'#E4F75A',brandLo:'#C7DE3B',onBrand:'#0B2418',hero:'#06140D',deep:'#091A11',chalk:'#F1F4EA',heroMuted:'#9FB4A6',surface:'#0D2218',ink:'#F1F4EA',muted:'#9FB4A6',brandText:'#D9F24A',opponent:'#9FB4A6',line:'#294B38',gold:'#E8C35A',error:'#FF8A7A',court:'#1E5A3A',darkMeta:'#06140D',lightMeta:'#2B6E4B'},
 axis:{name:'AXIS',brand:'#D7FF3B',brandHi:'#E6FF7A',brandLo:'#B9E21C',onBrand:'#0B0F04',hero:'#06080B',deep:'#0E1319',chalk:'#F3F2EC',heroMuted:'#A9B2BC',surface:'#F3F2EC',ink:'#0D1116',muted:'#5A636C',brandText:'#3F6B00',opponent:'#B8C0C8',line:'#D5DADF',gold:'#B8862B',error:'#FF5A4E',court:'#1E5A3A',darkMeta:'#07090C',lightMeta:'#F2F2EC'},
 maroon:{name:'Maroon & Cream',brand:'#7A1F2B',brandHi:'#9B2E3E',brandLo:'#5E1520',onBrand:'#F3EBDD',hero:'#7A1F2B',deep:'#5E1621',chalk:'#F3EBDD',heroMuted:'#E9CBCF',surface:'#FFFDF8',ink:'#1E1A17',muted:'#6B625A',brandText:'#7A1F2B',opponent:'#C9A9AE',line:'#E4D9C8',gold:'#B8862B',error:'#C0392B',court:'#2E6B45',darkMeta:'#120709',lightMeta:'#F3EBDD'},
} as const;
export function readSkin(storage:Pick<Storage,'getItem'>):SkinChoice {try{const s=storage.getItem(SKIN_KEY);return s==='axis'||s==='maroon'||s==='court'?s:'court';}catch{return 'court';}}
export function currentSkin():SkinChoice {if(typeof document!=='undefined'){const s=document.documentElement.dataset.skin;if(s==='court'||s==='axis'||s==='maroon')return s;}try{return readSkin(localStorage);}catch{return 'court';}}
export function artworkPalette(){return SKINS[currentSkin()];}
