const fmt = (() => {
  try {
    return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
})();
export const formatDate = (t: number) => fmt.format(new Date(t));
const BN = '০১২৩৪৫৬৭৮৯';
export const bnNum = (n: number | string) => String(n).replace(/\d/g, (d) => BN[Number(d)]);
