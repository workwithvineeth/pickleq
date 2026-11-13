import {describe,expect,it} from 'vitest';
import {contactHref,primaryAction} from './RallyEvent';

describe('event primary button', () => {
  it('follows the event state', () => {
    expect(primaryAction({status:'done',registrationOpen:true})).toEqual({label:'See the results',to:'results'});
    expect(primaryAction({status:'live',registrationOpen:true})).toEqual({label:'Watch live',to:'live'});
    expect(primaryAction({status:'draft',registrationOpen:true})).toEqual({label:'Enter the event',to:'enter'});
    expect(primaryAction({status:'draft',registrationOpen:false,contact:'98765 43210'})).toEqual({label:'Entries closed · Message the organiser',to:'contact'});
    expect(primaryAction({status:'draft',registrationOpen:false})).toEqual({label:'Entries closed',to:null});
  });
  it('turns the organiser contact into a link only when it is one', () => {
    expect(contactHref('WhatsApp 98765 43210')).toBe('https://wa.me/919876543210');
    expect(contactHref('+44 7700 900123')).toBe('https://wa.me/447700900123');
    expect(contactHref('Email desk@club.test')).toBe('mailto:desk@club.test');
    expect(contactHref('https://club.test/contact')).toBe('https://club.test/contact');
    expect(contactHref('Ask at the desk')).toBeNull();
    expect(contactHref('javascript:alert(1)')).toBeNull();
  });
});
