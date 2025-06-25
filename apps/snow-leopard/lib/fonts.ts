import { Playfair_Display, Lora, Montserrat, Poppins, Fira_Code } from 'next/font/google';

export const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const firacode = Fira_Code({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

export const googleFonts = {
  playfair,
  lora,
  montserrat,
  poppins,
  firacode,
} as const;

export type FontOption = keyof typeof googleFonts; 