import type { TitleChart } from './model';

/**
 * A made-up chain in the owner's format (no real people, land or case): two CS owners, inheritance down
 * three generations, several deeds into one buyer who becomes owner by inheritance and purchase, and a
 * line of sale from one heir. Used for tests and the preview.
 */
export const SAMPLE_CHART: TitleChart = {
  heading: ['বিজ্ঞ সিনিয়র সহকারী জজ আদালত, নমুনাপুর', 'অন্য মোকদ্দমা নং ০০/২০২৬'],
  persons: [
    ['a', 'শেখ আকবর'], ['b', 'শেখ বাদল'], ['c', 'চম্পা বিবি'], ['d', 'দেলোয়ার উদ্দিন'], ['e', 'এনায়েত শেখ'],
    ['f', 'ফাতেমা বিবি'], ['g', 'গিয়াস উদ্দিন'], ['h', 'হাসনা বিবি'], ['i', 'ইদ্রিস আলী'], ['j', 'জাহানারা'],
    ['k', 'কামাল উদ্দিন'], ['l', 'লাইলী বেগম'], ['m', 'মরিয়ম বিবি'], ['n', 'নাসিমা খাতুন'], ['o', 'ওয়াহিদ গং'],
    ['p', 'পারভীন আক্তার'], ['q', 'কাশেম আলী'], ['r', 'রুবিনা বেগম'],
  ].map(([id, name]) => ({ id, name })),
  steps: [
    { id: 'cs', kind: 'record', survey: 'CS', owners: [
      { person: 'a', label: 'সিএস রেকর্ডিয় মালিক', area: '50' }, { person: 'b', label: 'সিএস রেকর্ডিয় মালিক', area: '50' }] },
    { id: 'w1', kind: 'inheritance', deceased: 'a', heirs: [{ person: 'c', relation: 'স্ত্রী', share: '1/4' }, { person: 'd', relation: 'পুত্র', share: '3/4' }] },
    { id: 'w2', kind: 'inheritance', deceased: 'd', heirs: [{ person: 'c', relation: 'মাতা', share: '1/6' }, { person: 'e', relation: 'চাচা', share: '5/12' }, { person: 'b', relation: 'চাচা', share: '5/12' }] },
    { id: 'w3', kind: 'inheritance', deceased: 'c', heirs: [{ person: 'g', relation: 'পুত্র', share: '1' }] },
    { id: 'd1', kind: 'deed', no: '1001', date: '12/03/1986', type: 'সাফ কবলা', area: '18.75', from: ['g'], to: [{ person: 'h' }] },
    { id: 'd2', kind: 'deed', no: '2002', date: '07/10/1997', type: 'হেবা', area: '18.75', from: ['h'], to: [{ person: 'k' }] },
    { id: 'w4', kind: 'inheritance', deceased: 'b', heirs: [
      { person: 'f', relation: 'স্ত্রী', share: '1/8' }, { person: 'i', relation: 'পুত্র', share: '7/16' }, { person: 'j', relation: 'কন্যা', share: '7/32' }, { person: 'l', relation: 'কন্যা', share: '7/32' }] },
    { id: 'w5', kind: 'inheritance', deceased: 'l', heirs: [{ person: 'o', relation: '৪পুত্র', share: '1' }] },
    { id: 'd3', kind: 'deed', no: '3003', date: '23/08/1998', type: 'পরিমাণ', area: '14.35', from: ['o'], to: [{ person: 'k' }] },
    { id: 'd4', kind: 'deed', no: '4004', date: '05/09/1999', type: 'দানপত্র', area: '14.35', from: ['j'], to: [{ person: 'k' }] },
    { id: 'w6', kind: 'inheritance', deceased: 'i', heirs: [
      { person: 'k', relation: 'পুত্র', area: '12.6' }, { person: 'm', relation: 'কন্যা', area: '6.3', lines: ['সিটি রেকর্ডীয় মালিক'] }, { person: 'n', relation: 'কন্যা', area: '6.3' }, { person: 'f', relation: 'স্ত্রী', area: '3.5' }] },
    { id: 'mk', kind: 'merge', person: 'k', caption: 'ওয়ারিশ ও খরিদসূত্রে মালিক', lines: ['সিটি দাগ নং 601'] },
    { id: 'd5', kind: 'deed', no: '5005', date: '07/09/2008', type: 'সাফ কবলা', area: '4.125', from: ['m'], to: [{ person: 'p' }], lines: ['সিটি দাগ নং 601'] },
    { id: 'd6', kind: 'deed', no: '6006', date: '24/12/2010', type: 'সাফ কবলা', area: '4.125', from: ['p'], to: [{ person: 'r' }], lines: ['সিটি দাগ নং 601'] },
  ],
  highlight: { step: 'w6', person: 'm' },
  notes: ['এই নমুনা চার্টের সব নাম, দাগ ও মোকদ্দমা কাল্পনিক।'],
  preparedBy: ['Research & Prepared By:', 'ADVOCATE NAME', 'Advocate, Dhaka Judge Court'],
};
