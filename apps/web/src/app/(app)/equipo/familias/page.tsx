'use client';

/**
 * /equipo/familias — Acceso de familias (R-05).
 *
 * Dirección (users:read/write) puede:
 *  - Ver los vínculos familiares del centro.
 *  - Dar acceso a un familiar (crea el usuario FAMILIAR si no existe y lo vincula).
 *  - Ajustar el control de privacidad por vínculo (qué ve en el portal, UX-20).
 *  - Revocar el acceso.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge, Button, Card, CardContent, CardTitle, FieldError, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';

const linkSchema = z.object({
  email: z.string().trim().email('Email no válido.'),
  password: z.string().min(8, 'Mínimo 8 caracteres.').max(72),
});

interface PrivacyState {
  canSeeCare: boolean;
  canSeeMedication: boolean;
  canSeeAssessments: boolean;
}

export default function FamilyAccessPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const me = api.me.useQuery();
  const canManage = me.data?.permissions.includes('users:write') ?? false;
  const canRead = me.data?.permissions.includes('users:read') ?? false;

  useEffect(() => {
    if (me.data && !canRead) router.replace('/');
  }, [me.data, canRead, router]);

  const links = api.family.listLinks.useQuery(undefined, { enabled: canRead });
  const residents = api.residents.list.useQuery(undefined, { enabled: canRead });

  const [form, setForm] = useState({ residentId: '', email: '', name: '', relationship: '', password: '' });
  const linkForm = useZodForm(linkSchema);

  const refresh = () => utils.family.listLinks.invalidate();

  const link = api.family.link.useMutation({
    onSuccess: async () => {
      toast.success('Acceso concedido. Comunica las credenciales al familiar.');
      setForm({ residentId: '', email: '', name: '', relationship: '', password: '' });
      linkForm.clearErrors();
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const unlink = api.family.unlink.useMutation({
    onSuccess: async () => {
      toast.success('Acceso revocado.');
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const updatePrivacy = api.family.updatePrivacy.useMutation({
    onSuccess: async () => {
      toast.success('Privacidad actualizada.');
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.residentId) {
      toast.error('Elige un residente.');
      return;
    }
    const data = linkForm.validate({ email: form.email, password: form.password });
    if (!data) return;
    link.mutate({
      residentId: form.residentId,
      email: data.email,
      password: data.password,
      name: form.name || undefined,
      relationship: form.relationship || undefined,
    });
  }

  async function onUnlink(linkId: string, email: string) {
    const ok = await confirm({
      title: 'Revocar acceso',
      description: `Se retirará el acceso de ${email} al portal. Esta acción queda registrada.`,
      confirmLabel: 'Revocar',
      tone: 'danger',
    });
    if (ok) unlink.mutate({ linkId });
  }

  function togglePrivacy(linkId: string, current: PrivacyState, key: keyof PrivacyState) {
    updatePrivacy.mutate({ linkId, ...current, [key]: !current[key] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/equipo" className="text-sm text-brand-700 hover:underline">
          ← Equipo
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">Acceso de familias</h1>
        <p className="text-sm text-[#1A3A3F]/60">
          Vincula familiares a un residente y controla qué pueden ver en el portal.
        </p>
      </div>

      {canManage && (
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Dar acceso a un familiar</CardTitle>
            <form className="flex flex-col gap-3" noValidate onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="resident">Residente</Label>
                  <Select
                    id="resident"
                    value={form.residentId}
                    onChange={(e) => setForm((s) => ({ ...s, residentId: e.target.value }))}
                  >
                    <option value="">Elige…</option>
                    {(residents.data ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.firstName} {r.lastName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="relationship">Parentesco</Label>
                  <Input
                    id="relationship"
                    placeholder="p. ej. hija"
                    value={form.relationship}
                    onChange={(e) => setForm((s) => ({ ...s, relationship: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email del familiar</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    aria-invalid={Boolean(linkForm.errors.email)}
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  />
                  <FieldError>{linkForm.errors.email}</FieldError>
                </div>
                <div>
                  <Label htmlFor="name">Nombre (opcional)</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="password">Contraseña provisional</Label>
                  <Input
                    id="password"
                    type="text"
                    aria-invalid={Boolean(linkForm.errors.password)}
                    placeholder="mín. 8 caracteres"
                    value={form.password}
                    onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  />
                  <FieldError>{linkForm.errors.password}</FieldError>
                </div>
              </div>
              <Button type="submit" disabled={link.isPending} className="self-start">
                {link.isPending ? 'Concediendo…' : 'Conceder acceso'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">Vínculos actuales</CardTitle>
          {links.isLoading ? (
            <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
          ) : (links.data ?? []).length === 0 ? (
            <p className="text-sm text-[#1A3A3F]/60">Todavía no hay familiares con acceso.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(links.data ?? []).map((l) => {
                const privacy: PrivacyState = {
                  canSeeCare: l.canSeeCare,
                  canSeeMedication: l.canSeeMedication,
                  canSeeAssessments: l.canSeeAssessments,
                };
                return (
                  <li key={l.id} className="rounded-md border border-brand-100 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {l.user.name ?? l.user.email}{' '}
                          {l.relationship && <Badge tone="blue">{l.relationship}</Badge>}
                        </p>
                        <p className="text-sm text-[#1A3A3F]/60">
                          {l.user.email} · Residente:{' '}
                          <Link href={`/residentes/${l.resident.id}`} className="text-brand-700 hover:underline">
                            {l.resident.firstName} {l.resident.lastName}
                          </Link>
                        </p>
                      </div>
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => onUnlink(l.id, l.user.email)}>
                          Revocar
                        </Button>
                      )}
                    </div>
                    {canManage && (
                      <fieldset className="mt-2 flex flex-wrap gap-4 border-t border-brand-100/60 pt-2 text-sm">
                        <legend className="sr-only">Privacidad del portal</legend>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={privacy.canSeeCare}
                            onChange={() => togglePrivacy(l.id, privacy, 'canSeeCare')}
                          />
                          Novedades
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={privacy.canSeeMedication}
                            onChange={() => togglePrivacy(l.id, privacy, 'canSeeMedication')}
                          />
                          Medicación
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={privacy.canSeeAssessments}
                            onChange={() => togglePrivacy(l.id, privacy, 'canSeeAssessments')}
                          />
                          Valoraciones
                        </label>
                      </fieldset>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
