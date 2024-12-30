export default function numberFormat(count: number) {
  const nFormat = new Intl.NumberFormat();
  return nFormat.format(count);
}
