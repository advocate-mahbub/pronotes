import type { TitleChart } from './model';

/** A made-up chain (no real people or land): CS record → inheritance → SA record → two deeds → mutation. */
export const SAMPLE_CHART: TitleChart = {
  title: 'টাইটেল চার্ট (নমুনা)',
  plot: { district: 'ঢাকা', upazila: 'সাভার', mouza: 'নমুনাপুর', jl: '45', dag: { CS: '120', SA: '135', RS: '210' }, area: '33' },
  persons: [
    { id: 'karim', name: 'করিম উদ্দিন', relation: 'পিতা: মৃত জব্বার' },
    { id: 'rahim', name: 'রহিম উদ্দিন', relation: 'পিতা: মৃত জব্বার' },
    { id: 'jamila', name: 'জমিলা খাতুন', relation: 'স্বামী: করিম' },
    { id: 'abdul', name: 'আব্দুল করিম', relation: 'পিতা: করিম' },
    { id: 'alam', name: 'আলম মিয়া', relation: 'পিতা: করিম' },
    { id: 'salma', name: 'সালমা বেগম', relation: 'পিতা: করিম' },
    { id: 'hasan', name: 'হাসান আলী', relation: 'পিতা: মোতালেব' },
  ],
  steps: [
    { id: 'cs', kind: 'record', survey: 'CS', khatian: '55', owners: [{ person: 'karim', share: '1/2' }, { person: 'rahim', share: '1/2' }] },
    { id: 'w1', kind: 'inheritance', deceased: 'karim', date: '1961', heirs: [
      { person: 'jamila', share: '1/8' }, { person: 'abdul', share: '7/20' }, { person: 'alam', share: '7/20' }, { person: 'salma', share: '7/40' }] },
    { id: 'sa', kind: 'record', survey: 'SA', khatian: '88', owners: [
      { person: 'jamila', share: '1/16' }, { person: 'abdul', share: '7/40' }, { person: 'alam', share: '7/40' }, { person: 'salma', share: '7/80' }, { person: 'rahim', share: '1/2' }] },
    { id: 'd1', kind: 'deed', no: '1234', date: '12.03.1985', office: 'সাভার', type: 'সাফ কবলা', from: [{ person: 'rahim', area: '16.5' }], to: [{ person: 'hasan' }] },
    { id: 'd2', kind: 'deed', no: '567', date: '04.11.1992', office: 'সাভার', type: 'সাফ কবলা', from: [{ person: 'abdul', area: '5.775' }, { person: 'alam', area: '5.775' }], to: [{ person: 'hasan' }] },
    { id: 'm1', kind: 'mutation', caseNo: '3021/1993', khatian: '410', owners: ['hasan'] },
  ],
};
