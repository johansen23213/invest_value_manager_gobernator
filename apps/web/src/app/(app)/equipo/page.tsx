'use client';

/**
 * /equipo — Gestión de equipo (R-03 Wave B).
 *
 * Lista los usuarios del tenant (excluye FAMILIAR, ver R-05).
 * Permite:
 *  - Filtrar por rol y por función (jobTitle).
 *  - Ver el acceso efectivo de un usuario (RoleCapabilitiesCard en Dialog).
 *  - Cambiar el rol (users:write) con confirmación.
 *  - Editar la función/jobTitle (users:write).
 *
 * Acceso: users:read para ver, users:write para editar.
 * Sin permiso: redirige a '/'.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { RoleCapabilitiesCard } from '@/components/role-capabilities-card';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  FieldError,
  Input,
  Label,
  Select,
} from '@vetlla/ui';
import { ROLE_LABELS } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { useZodForm } from '@/lib/form';
import { JOB_TITLE_OPTIONS, suggestRoleForJobTitle } from '@/lib/job-presets';

const inviteSchema = z.object({
  email: z.string().trim().email('Email no válido.'),
  password: z.string().min(8, 'Mínimo 8 caracteres.').max(72),
});

// ── Iconos inline ─────────────────────────────────────────────────────────────

function IconUser() {
  return (
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: UserRole[] = ['DIRECTOR', 'SANITARIO', 'AUXILIAR', 'SUPERADMIN'];

const ROLE_TONE_MAP: Record<string, 'green' | 'blue' | 'amber' | 'neutral' | 'red'> = {
  DIRECTOR:   'amber',
  SANITARIO:  'blue',
  AUXILIAR:   'green',
  SUPERADMIN: 'red',
  FAMILIAR:   'neutral',
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TeamUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  jobTitle: string | null;
};

// ── Dialog: editar función (jobTitle) ─────────────────────────────────────────

interface EditJobTitleDialogProps {
  user: TeamUser;
  tenantTitles: string[];
  canWrite: boolean;
  onSave: (userId: string, jobTitle: string | null) => void;
  onClose: () => void;
}

function EditJobTitleDialog({ user, tenantTitles, canWrite, onSave, onClose }: EditJobTitleDialogProps) {
  const { t } = useT();
  const [value, setValue] = useState(user.jobTitle ?? '');
  const [suggestedRole, setSuggestedRole] = useState<UserRole | undefined>(undefined);

  // Combinar sugerencias del preset + títulos ya usados en el tenant (unicidad)
  const allSuggestions = [
    ...new Set([...JOB_TITLE_OPTIONS, ...tenantTitles]),
  ].sort();

  function handleChange(v: string) {
    setValue(v);
    setSuggestedRole(suggestRoleForJobTitle(v));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t('team.editJobTitle.title')}</DialogTitle>
        <p className="text-sm text-[#1A3A3F]/60">
          {user.name ?? user.email}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <Label htmlFor="job-title-input">{t('team.editJobTitle.label')}</Label>
            <Input
              id="job-title-input"
              list="job-title-datalist"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={t('team.editJobTitle.placeholder')}
              disabled={!canWrite}
              autoComplete="off"
            />
            <datalist id="job-title-datalist">
              {allSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          {suggestedRole && suggestedRole !== user.role && (
            <p className="rounded-md bg-warm-50 px-3 py-2 text-sm text-warm-700">
              {t('team.editJobTitle.presetNote', { role: ROLE_LABELS[suggestedRole] ?? suggestedRole })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('action.cancel')}</Button>
          {canWrite && (
            <Button
              variant="primary"
              onClick={() => {
                onSave(user.id, value.trim() || null);
                onClose();
              }}
            >
              {t('action.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: acceso efectivo ───────────────────────────────────────────────────

interface AccessDialogProps {
  user: TeamUser;
  onClose: () => void;
}

function AccessDialog({ user, onClose }: AccessDialogProps) {
  const { t } = useT();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>
          {t('team.accessDialog.title')} — {user.name ?? user.email}
        </DialogTitle>
        <p className="mb-3 text-sm text-[#1A3A3F]/60">
          {t('team.accessDialog.subtitle', { role: ROLE_LABELS[user.role] ?? user.role })}
        </p>
        <RoleCapabilitiesCard role={user.role} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('action.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: cambiar rol ───────────────────────────────────────────────────────

interface ChangeRoleDialogProps {
  user: TeamUser;
  onSave: (userId: string, newRole: UserRole) => void;
  onClose: () => void;
}

function ChangeRoleDialog({ user, onSave, onClose }: ChangeRoleDialogProps) {
  const { t } = useT();
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t('team.changeRole.title')}</DialogTitle>
        <p className="text-sm text-[#1A3A3F]/60">{user.name ?? user.email}</p>
        <div className="mt-4">
          <Label htmlFor="new-role-select">{t('team.changeRole.label')}</Label>
          <Select
            id="new-role-select"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </Select>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              onSave(user.id, selectedRole);
              onClose();
            }}
            disabled={selectedRole === user.role}
          >
            {t('team.changeRole.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EquipoPage() {
  const { t, locale } = useT();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const me = api.me.useQuery();
  const canRead  = me.data?.permissions.includes('users:read')  ?? null;
  const canWrite = me.data?.permissions.includes('users:write') ?? false;

  useEffect(() => {
    if (canRead === false) router.replace('/');
  }, [canRead, router]);

  const usersQuery = api.users.list.useQuery(undefined, { enabled: canRead === true });
  const jobTitlesQuery = api.users.listJobTitles.useQuery(undefined, { enabled: canRead === true });

  const [filterRole, setFilterRole]       = useState<string>('');
  const [filterTitle, setFilterTitle]     = useState<string>('');
  const [accessUser, setAccessUser]       = useState<TeamUser | null>(null);
  const [editJobUser, setEditJobUser]     = useState<TeamUser | null>(null);
  const [changeRoleUser, setChangeRoleUser] = useState<TeamUser | null>(null);

  const updateRole = api.users.updateRole.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      toast.success(t('team.roleChanged'));
    },
    onError: (e) => toast.error(e.message),
  });

  const updateProfile = api.users.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      await utils.users.listJobTitles.invalidate();
      toast.success(t('team.profileUpdated'));
    },
    onError: (e) => toast.error(e.message),
  });

  // Alta de usuario del equipo (Sprint 5).
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'AUXILIAR' as UserRole, jobTitle: '', password: '' });
  const inviteForm = useZodForm(inviteSchema);
  const inviteUser = api.users.invite.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      await utils.users.listJobTitles.invalidate();
      toast.success('Usuario creado. Comunica la contraseña provisional.');
      setInvite({ email: '', name: '', role: 'AUXILIAR', jobTitle: '', password: '' });
      inviteForm.clearErrors();
      setShowInvite(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    const data = inviteForm.validate({ email: invite.email, password: invite.password });
    if (!data) return;
    inviteUser.mutate({
      email: data.email,
      password: data.password,
      role: invite.role as 'DIRECTOR' | 'SANITARIO' | 'AUXILIAR',
      name: invite.name || undefined,
      jobTitle: invite.jobTitle || undefined,
    });
  }

  const handleChangeRole = useCallback(
    async (userId: string, newRole: UserRole) => {
      const user = usersQuery.data?.find((u) => u.id === userId);
      if (!user) return;
      const result = await confirm({
        title: t('team.changeRole.confirmTitle'),
        description: t('team.changeRole.confirmDesc', {
          from: ROLE_LABELS[user.role] ?? user.role,
          to: ROLE_LABELS[newRole] ?? newRole,
          email: user.email,
        }),
        confirmLabel: t('team.changeRole.confirm'),
        tone: 'danger',
      });
      if (!result) return;
      updateRole.mutate({ userId, newRole });
    },
    [usersQuery.data, confirm, t, updateRole],
  );

  const handleUpdateProfile = useCallback(
    (userId: string, jobTitle: string | null) => {
      updateProfile.mutate({ userId, jobTitle });
    },
    [updateProfile],
  );

  // Filtro
  const filteredUsers = (usersQuery.data ?? []).filter((u) => {
    if (filterRole && u.role !== filterRole) return false;
    if (filterTitle && !(u.jobTitle ?? '').toLowerCase().includes(filterTitle.toLowerCase())) return false;
    return true;
  });

  if (canRead === null || me.isLoading) {
    return <p className="text-[#1A3A3F]/60">{t('state.loading')}</p>;
  }
  if (!canRead) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('team.title')}</h1>
          <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('team.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button onClick={() => setShowInvite((v) => !v)} data-testid="btn-invite-user">
              Alta de usuario
            </Button>
          )}
          <Link
            href="/equipo/familias"
            className="rounded-md border border-brand-200 px-3 py-2 text-sm hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Acceso de familias
          </Link>
          <Link
            href="/equipo/roles"
            className="rounded-md border border-brand-200 px-3 py-2 text-sm hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {t('team.rolesReference')}
          </Link>
        </div>
      </div>

      {/* Alta de usuario (Sprint 5) */}
      {canWrite && showInvite && (
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Alta de un miembro del equipo</CardTitle>
            <form className="flex flex-col gap-3" noValidate onSubmit={submitInvite}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="inv-email">Email</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    inputMode="email"
                    aria-invalid={Boolean(inviteForm.errors.email)}
                    value={invite.email}
                    onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                  />
                  <FieldError>{inviteForm.errors.email}</FieldError>
                </div>
                <div>
                  <Label htmlFor="inv-name">Nombre (opcional)</Label>
                  <Input id="inv-name" value={invite.name} onChange={(e) => setInvite((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="inv-role">Rol</Label>
                  <Select
                    id="inv-role"
                    value={invite.role}
                    onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value as UserRole }))}
                  >
                    <option value="AUXILIAR">{ROLE_LABELS.AUXILIAR}</option>
                    <option value="SANITARIO">{ROLE_LABELS.SANITARIO}</option>
                    <option value="DIRECTOR">{ROLE_LABELS.DIRECTOR}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="inv-job">Función (opcional)</Label>
                  <Input id="inv-job" value={invite.jobTitle} onChange={(e) => setInvite((s) => ({ ...s, jobTitle: e.target.value }))} placeholder="p. ej. DUE, Fisioterapeuta" />
                </div>
                <div>
                  <Label htmlFor="inv-pass">Contraseña provisional</Label>
                  <Input
                    id="inv-pass"
                    type="text"
                    aria-invalid={Boolean(inviteForm.errors.password)}
                    placeholder="mín. 8 caracteres"
                    value={invite.password}
                    onChange={(e) => setInvite((s) => ({ ...s, password: e.target.value }))}
                  />
                  <FieldError>{inviteForm.errors.password}</FieldError>
                </div>
              </div>
              <Button type="submit" disabled={inviteUser.isPending} className="self-start">
                {inviteUser.isPending ? 'Creando…' : 'Crear usuario'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div>
          <Label htmlFor="filter-role" className="sr-only">{t('team.filterByRole')}</Label>
          <Select
            id="filter-role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-auto"
            aria-label={t('team.filterByRole')}
          >
            <option value="">{t('team.allRoles')}</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-title" className="sr-only">{t('team.filterByTitle')}</Label>
          <Input
            id="filter-title"
            value={filterTitle}
            onChange={(e) => setFilterTitle(e.target.value)}
            placeholder={t('team.filterByTitle')}
            className="w-52"
            aria-label={t('team.filterByTitle')}
          />
        </div>
      </div>

      {/* Lista de usuarios */}
      {usersQuery.isLoading && <p className="text-[#1A3A3F]/60">{t('state.loading')}</p>}
      {!usersQuery.isLoading && filteredUsers.length === 0 && (
        <p className="text-[#1A3A3F]/60">{t('team.empty')}</p>
      )}

      <ul className="flex flex-col gap-3" aria-label={t('team.title')}>
        {filteredUsers.map((user) => (
          <li
            key={user.id}
            data-testid="team-user-row"
            data-user-role={user.role}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white px-4 py-3 shadow-sm"
          >
            {/* Info */}
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <IconUser />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-[#1A3A3F]">
                  {user.name ?? user.email}
                </p>
                <p className="truncate text-sm text-[#1A3A3F]/60">{user.email}</p>
                <p className="truncate text-xs text-[#1A3A3F]/40">
                  Último acceso: {user.lastLoginAt ? formatDateTime(locale, user.lastLoginAt) : 'nunca'}
                </p>
              </div>
            </div>

            {/* Rol + función */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ROLE_TONE_MAP[user.role] ?? 'neutral'} icon={<IconShield />}>
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
              {user.jobTitle && (
                <span className="text-sm text-[#1A3A3F]/70">{user.jobTitle}</span>
              )}
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setAccessUser(user as TeamUser)}
                className="min-h-[44px] text-sm"
                aria-label={`${t('team.viewAccess')} — ${user.name ?? user.email}`}
                data-testid="btn-view-access"
              >
                {t('team.viewAccess')}
              </Button>
              {canWrite && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setEditJobUser(user as TeamUser)}
                    className="min-h-[44px] text-sm"
                    aria-label={`${t('team.editFunction')} — ${user.name ?? user.email}`}
                  >
                    {t('team.editFunction')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setChangeRoleUser(user as TeamUser)}
                    className="min-h-[44px] text-sm"
                    aria-label={`${t('team.changeRole.button')} — ${user.name ?? user.email}`}
                  >
                    {t('team.changeRole.button')}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Nota sobre familiares (R-05 pendiente) */}
      <p className="text-xs text-[#1A3A3F]/40">
        {t('team.familiarNote')}
      </p>

      {/* Dialogs */}
      {accessUser && (
        <AccessDialog user={accessUser} onClose={() => setAccessUser(null)} />
      )}
      {editJobUser && (
        <EditJobTitleDialog
          user={editJobUser}
          tenantTitles={jobTitlesQuery.data ?? []}
          canWrite={canWrite}
          onSave={handleUpdateProfile}
          onClose={() => setEditJobUser(null)}
        />
      )}
      {changeRoleUser && (
        <ChangeRoleDialog
          user={changeRoleUser as TeamUser}
          onSave={handleChangeRole}
          onClose={() => setChangeRoleUser(null)}
        />
      )}
    </div>
  );
}
