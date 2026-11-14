import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {MessageSheet,StickyEnter} from './EventExtras';
describe('Message the club',()=>{
 it('opens WhatsApp with the typed message and never prints the number',()=>{
  const{container}=render(<MessageSheet eventName="Sunday Cup" club="Banyan Courts" href="https://wa.me/919876543210" onClose={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Asha'}});
  fireEvent.change(screen.getByLabelText('Your message'),{target:{value:'Is there parking?'}});
  const a=screen.getByRole('link',{name:'Open WhatsApp'});
  expect(a.getAttribute('href')).toBe('https://wa.me/919876543210?text='+encodeURIComponent('Is there parking?\n\nAsha'));
  expect(container.textContent).not.toMatch(/9876543210|wa\.me/);
 });
 it('uses email for an email contact, without printing the address, and closes on Escape',()=>{
  const close=vi.fn();const{container}=render(<MessageSheet eventName="Cup" club="Club" href="mailto:desk@club.test" onClose={close}/>);
  expect(screen.getByRole('link',{name:'Open email'}).getAttribute('href')).toMatch(/^mailto:desk@club\.test\?subject=Cup/);
  expect(container.textContent).not.toContain('desk@club.test');
  fireEvent.keyDown(window,{key:'Escape'});expect(close).toHaveBeenCalled();
 });
});
describe('sticky action bar',()=>{
 it('stays hidden while the top button is on screen',()=>{
  render(<StickyEnter label="Enter the event" disabled={false} onClick={()=>{}}/>);
  expect(screen.queryByRole('button',{name:'Enter the event'})).toBeNull();
 });
});
