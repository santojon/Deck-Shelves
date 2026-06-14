export function optionData(option: unknown) {
  return (option as any)?.data ?? option
}
