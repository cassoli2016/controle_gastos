/** "ajuda", "/ajuda", "help", "/help" (sem caixa/espacos) pedem o guia do bot. */
export function isHelpCommand(text: string): boolean {
  return /^\/?(ajuda|help)$/i.test(text.trim());
}
