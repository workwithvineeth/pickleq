export type SkinChoice='axis'|'maroon';
export const SKIN_KEY='pq-skin';
export const SKINS={
 axis:{name:'AXIS',brand:'#D7FF3B',brandHi:'#E6FF7A',brandLo:'#B9E21C',onBrand:'#0B0F04',hero:'#06080B',deep:'#0E1319',chalk:'#F3F2EC',heroMuted:'#A9B2BC',surface:'#F3F2EC',ink:'#0D1116',muted:'#5A636C',brandText:'#3F6B00',opponent:'#B8C0C8',line:'#D5DADF',gold:'#B8862B',error:'#FF5A4E',court:'#3D78FF',darkMeta:'#07090C',lightMeta:'#F2F2EC'},
 maroon:{name:'Maroon & Cream',brand:'#7A1F2B',brandHi:'#9B2E3E',brandLo:'#5E1520',onBrand:'#F3EBDD',hero:'#7A1F2B',deep:'#5E1621',chalk:'#F3EBDD',heroMuted:'#E9CBCF',surface:'#FFFDF8',ink:'#1E1A17',muted:'#6B625A',brandText:'#7A1F2B',opponent:'#C9A9AE',line:'#E4D9C8',gold:'#B8862B',error:'#C0392B',court:'#2E6B45',darkMeta:'#120709',lightMeta:'#F3EBDD'},
} as const;
export function readSkin(storage:Pick<Storage,'getItem'>):SkinChoice {try{return storage.getItem(SKIN_KEY)==='maroon'?'maroon':'axis';}catch{return 'axis';}}
export function currentSkin():SkinChoice {if(typeof document!=='undefined'&&document.documentElement.dataset.skin)return document.documentElement.dataset.skin==='maroon'?'maroon':'axis';try{return readSkin(localStorage);}catch{return 'axis';}}
export function artworkPalette(){return SKINS[currentSkin()];}
