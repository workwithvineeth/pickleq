import {useEffect,useState} from 'react';
export function useReducedMotion(){const[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),f=()=>setReduced(q.matches);q.addEventListener?.('change',f);return()=>q.removeEventListener?.('change',f)},[]);return reduced}
