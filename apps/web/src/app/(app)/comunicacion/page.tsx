import { redirect } from 'next/navigation';

// La ruta /comunicacion redirige directamente a /comunicacion/comunicados
export default function ComunicacionPage() {
  redirect('/comunicacion/comunicados');
}
