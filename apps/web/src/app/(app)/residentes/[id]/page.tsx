'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import type { AllergySeverity, ContactRelation } from '@vetlla/db';
import { api } from '@/trpc/react';
import { interpretScale, SCALE_RANGES, type ScaleType } from '@/lib/scales';
import {
  ALLERGY_SEVERITY_LABELS,
  ASSESSMENT_TYPE_LABELS,
  CONTACT_RELATION_LABELS,
  DEPENDENCY_GRADE_LABELS,
  RESIDENT_STATUS_LABELS,
} from '@/lib/labels';

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES');
}

export default function ResidentDetailPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('residents:write') ?? false;
  const canClinical = me.data?.permissions.includes('clinical:write') ?? false;
  const resident = api.residents.get.useQuery({ id: residentId });

  const refresh = () => utils.residents.get.invalidate({ id: residentId });

  // Formularios (estado mínimo).
  const [contact, setContact] = useState({ name: '', relation: 'HIJO_A', phone: '' });
  const [allergy, setAllergy] = useState({ substance: '', severity: '' });
  const [diagnosis, setDiagnosis] = useState({ description: '', code: '' });
  const [assessment, setAssessment] = useState({ type: 'BARTHEL' as ScaleType, score: '' });

  const addContact = api.residents.addContact.useMutation({
    onSuccess: async () => {
      setContact({ name: '', relation: 'HIJO_A', phone: '' });
      await refresh();
    },
  });
  const addAllergy = api.residents.addAllergy.useMutation({
    onSuccess: async () => {
      setAllergy({ substance: '', severity: '' });
      await refresh();
    },
  });
  const addDiagnosis = api.residents.addDiagnosis.useMutation({
    onSuccess: async () => {
      setDiagnosis({ description: '', code: '' });
      await refresh();
    },
  });
  const addAssessment = api.residents.addAssessment.useMutation({
    onSuccess: async () => {
      setAssessment({ type: 'BARTHEL', score: '' });
      await refresh();
    },
  });

  if (resident.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (!resident.data) return <p className="text-slate-500">Residente no encontrado.</p>;
  const r = resident.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/residentes" className="text-sm text-blue-600 hover:underline">
          ← Residentes
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {r.firstName} {r.lastName}
        </h1>
        <p className="text-sm text-slate-500">
          {r.center.name} · {r.bed ? `Plaza ${r.bed.code} (${r.bed.unit.name})` : 'Sin plaza'} ·{' '}
          {DEPENDENCY_GRADE_LABELS[r.dependencyGrade]}{' '}
          <Badge tone={r.status === 'ACTIVO' ? 'green' : 'neutral'}>
            {RESIDENT_STATUS_LABELS[r.status]}
          </Badge>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Nacimiento: {fmtDate(r.birthDate)} · Ingreso: {fmtDate(r.admissionDate)} · DNI/NIE:{' '}
          {r.nationalId ?? '—'}
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            href={`/residentes/${residentId}/medicacion`}
            className="min-h-touch rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Medicación
          </Link>
          <Link
            href={`/residentes/${residentId}/pia`}
            className="min-h-touch rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            PIA
          </Link>
        </div>
      </div>

      {/* Escalas */}
      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">Escalas de valoración</CardTitle>
          {r.assessments.length === 0 ? (
            <p className="text-sm text-slate-500">Sin valoraciones.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {r.assessments.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{ASSESSMENT_TYPE_LABELS[a.type]}</span>: {a.score}/
                    {SCALE_RANGES[a.type as ScaleType].max}{' '}
                    <Badge tone="blue">{interpretScale(a.type as ScaleType, a.score)}</Badge>
                  </span>
                  <span className="text-slate-400">{fmtDate(a.assessedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {canClinical && (
            <form
              className="mt-3 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addAssessment.mutate({
                  residentId,
                  type: assessment.type,
                  score: Number(assessment.score),
                });
              }}
            >
              <div>
                <Label htmlFor="aType">Escala</Label>
                <Select
                  id="aType"
                  value={assessment.type}
                  onChange={(e) => setAssessment((s) => ({ ...s, type: e.target.value as ScaleType }))}
                >
                  <option value="BARTHEL">Barthel (0–100)</option>
                  <option value="TINETTI">Tinetti (0–28)</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="aScore">Puntuación</Label>
                <Input
                  id="aScore"
                  type="number"
                  min={0}
                  max={SCALE_RANGES[assessment.type].max}
                  value={assessment.score}
                  onChange={(e) => setAssessment((s) => ({ ...s, score: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" disabled={addAssessment.isPending}>
                Registrar valoración
              </Button>
              {addAssessment.error && (
                <p role="alert" className="w-full text-sm text-red-600">
                  {addAssessment.error.message}
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contactos */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Contactos</CardTitle>
            {r.contacts.length === 0 ? (
              <p className="text-sm text-slate-500">Sin contactos.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {r.contacts.map((ct) => (
                  <li key={ct.id}>
                    {ct.isPrimary && <Badge tone="green">Principal</Badge>} <strong>{ct.name}</strong> ·{' '}
                    {CONTACT_RELATION_LABELS[ct.relation]} {ct.phone ? `· ${ct.phone}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <form
                className="mt-3 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addContact.mutate({
                    residentId,
                    name: contact.name,
                    relation: contact.relation as ContactRelation,
                    phone: contact.phone || undefined,
                  });
                }}
              >
                <Input
                  placeholder="Nombre"
                  value={contact.name}
                  onChange={(e) => setContact((s) => ({ ...s, name: e.target.value }))}
                  required
                />
                <div className="flex gap-2">
                  <Select
                    value={contact.relation}
                    onChange={(e) => setContact((s) => ({ ...s, relation: e.target.value }))}
                  >
                    {Object.entries(CONTACT_RELATION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Teléfono"
                    value={contact.phone}
                    onChange={(e) => setContact((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>
                <Button type="submit" size="sm" disabled={addContact.isPending}>
                  Añadir contacto
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Alergias */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Alergias</CardTitle>
            {r.allergies.length === 0 ? (
              <p className="text-sm text-slate-500">Sin alergias registradas.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {r.allergies.map((al) => (
                  <li key={al.id}>
                    <strong>{al.substance}</strong>
                    {al.severity ? ` · ${ALLERGY_SEVERITY_LABELS[al.severity]}` : ''}
                    {al.reaction ? ` · ${al.reaction}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {canClinical && (
              <form
                className="mt-3 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addAllergy.mutate({
                    residentId,
                    substance: allergy.substance,
                    severity: (allergy.severity || undefined) as AllergySeverity | undefined,
                  });
                }}
              >
                <Input
                  placeholder="Sustancia"
                  value={allergy.substance}
                  onChange={(e) => setAllergy((s) => ({ ...s, substance: e.target.value }))}
                  required
                />
                <Select
                  value={allergy.severity}
                  onChange={(e) => setAllergy((s) => ({ ...s, severity: e.target.value }))}
                >
                  <option value="">Gravedad (opcional)</option>
                  {Object.entries(ALLERGY_SEVERITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" disabled={addAllergy.isPending}>
                  Añadir alergia
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Diagnósticos */}
        <Card className="md:col-span-2">
          <CardContent>
            <CardTitle className="mb-3 text-base">Diagnósticos</CardTitle>
            {r.diagnoses.length === 0 ? (
              <p className="text-sm text-slate-500">Sin diagnósticos.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {r.diagnoses.map((d) => (
                  <li key={d.id}>
                    {d.code ? <span className="text-slate-400">[{d.code}] </span> : null}
                    {d.description} <span className="text-slate-400">· {fmtDate(d.diagnosedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {canClinical && (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addDiagnosis.mutate({
                    residentId,
                    description: diagnosis.description,
                    code: diagnosis.code || undefined,
                  });
                }}
              >
                <div className="flex-1">
                  <Input
                    placeholder="Descripción"
                    value={diagnosis.description}
                    onChange={(e) => setDiagnosis((s) => ({ ...s, description: e.target.value }))}
                    required
                  />
                </div>
                <Input
                  placeholder="CIE-10"
                  value={diagnosis.code}
                  onChange={(e) => setDiagnosis((s) => ({ ...s, code: e.target.value }))}
                  className="max-w-[120px]"
                />
                <Button type="submit" size="sm" disabled={addDiagnosis.isPending}>
                  Añadir
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
