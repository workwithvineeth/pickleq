import {act,renderHook} from '@testing-library/react';
import {useState} from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {SLIDES,SLIDE_MS,useHeroSlides} from './useHeroSlides';
const run=(reduced:boolean)=>renderHook(()=>{const[slide,set]=useState(0);useHeroSlides(slide,()=>set(s=>(s+1)%SLIDES),reduced);return{slide,set};});
describe('Home hero slides',()=>{
 beforeEach(()=>{vi.useFakeTimers();});
 afterEach(()=>{vi.useRealTimers();});
 it('moves to the next photo every 6.5 s and wraps after the third',()=>{
  const h=run(false);
  expect(h.result.current.slide).toBe(0);
  act(()=>{vi.advanceTimersByTime(SLIDE_MS-1);});expect(h.result.current.slide).toBe(0);
  act(()=>{vi.advanceTimersByTime(1);});expect(h.result.current.slide).toBe(1);
  act(()=>{vi.advanceTimersByTime(SLIDE_MS);});expect(h.result.current.slide).toBe(2);
  act(()=>{vi.advanceTimersByTime(SLIDE_MS);});expect(h.result.current.slide).toBe(0);
 });
 it('gives a photo picked by hand the full 6.5 s',()=>{
  const h=run(false);
  act(()=>{vi.advanceTimersByTime(5000);});
  act(()=>{h.result.current.set(2);});
  act(()=>{vi.advanceTimersByTime(5000);});expect(h.result.current.slide).toBe(2);
  act(()=>{vi.advanceTimersByTime(1500);});expect(h.result.current.slide).toBe(0);
 });
 it('never moves with reduced motion',()=>{
  const h=run(true);
  act(()=>{vi.advanceTimersByTime(SLIDE_MS*4);});expect(h.result.current.slide).toBe(0);
 });
});
