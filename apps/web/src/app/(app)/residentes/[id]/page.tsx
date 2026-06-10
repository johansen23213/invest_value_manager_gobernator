'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  FieldError,
  Input,
  Label,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetlla/ui';
import type { AllergySeverity, ContactRelation } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { interpretScale, SCALE_RANGES, type ScaleType } from '@/lib/scales';
import {
  ALLERGY_SEVERITY_LABELS,
  ASSESSMENT_TYPE_LABELS,
  CONTACT_RELATION_LABELS,
} from '@/lib/labels';

const phoneSchema = z
  .union([z.literal(''), z.string().regex(/^[+()\d\s-]{6,20}$/, 'Teléfono no válido (6–20 caracteres).')])
  .optional();

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Indica el nombre.').max(120),
  phone: phoneSchema,
});

const allergySchema = z.object({
  substance: z.string().trim().min(1, 'Indica la sustancia.').max(120),
});

const diagnosisSchema = z.object({
  description: z.string().trim().min(1, 'Indica la descripción.').max(300),
});

export default function ResidentDetailPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const { locale } = useT();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);
  const toast = useToast();
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('residents:write') ?? false;
  const canClinical = me.data?.permissions.includes('clinical:write') ?? false;
  const resident = api.residents.get.useQuery({ id: residentId });

  const refresh = () => utils.residents.get.invalidate({ id: residentId });

  // Formularios (estado mínimo) + validación inline con Zod (UX-09).
  const [contact, setContact] = useState({ name: '', relation: 'HIJO_A', phone: '' });
  const [allergy, setAllergy] = useState({ substance: '', severity: '' });
  const [diagnosis, setDiagnosis] = useState({ description: '', code: '' });
  const [assessment, setAssessment] = useState({ type: 'BARTHEL' as ScaleType, score: '' });

  const contactForm = useZodForm(contactSchema);
  const allergyForm = useZodForm(allergySchema);
  const diagnosisForm = useZodForm(diagnosisSchema);
  const assessmentMax = SCALE_RANGES[assessment.type].max;
  const assessmentSchema = z.object({
    score: z.preprocess(
      (v) => (v === '' || v == null ? undefined : Number(v)),
      z
        .number({ invalid_type_error: 'Introduce una puntuación.' })
        .int('Debe ser un número entero.')
        .min(0, 'Mínimo 0.')
        .max(assessmentMax, `Máximo ${assessmentMax}.`),
    ),
  });
  const assessmentForm = useZodForm(assessmentSchema);

  const addContact = api.residents.addContact.useMutation({
    onSuccess: async () => {
      setContact({ name: '', relation: 'HIJO_A', phone: '' });
      contactForm.clearErrors();
      await refresh();
      toast.success('Contacto añadido.');
    },
    onError: (e) => toast.error(e.message),
  });
  const addAllergy = api.residents.addAllergy.useMutation({
    onSuccess: async () => {
      setAllergy({ substance: '', severity: '' });
      allergyForm.clearErrors();
      await refresh();
      toast.success('Alergia añadida.');
    },
    onError: (e) => toast.error(e.message),
  });
  const addDiagnosis = api.residents.addDiagnosis.useMutation({
    onSuccess: async () => {
      setDiagnosis({ description: '', code: '' });
      diagnosisForm.clearErrors();
      await refresh();
      toast.success('Diagnóstico añadido.');
    },
    onError: (e) => toast.error(e.message),
  });
  const addAssessment = api.residents.addAssessment.useMutation({
    onSuccess: async () => {
      setAssessment({ type: 'BARTHEL', score: '' });
      assessmentForm.clearErrors();
      await refresh();
      toast.success('Valoración registrada.');
    },
    onError: (e) => toast.error(e.message),
  });

  if (resident.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (!resident.data) return <p className="text-slate-500">Residente no encontrado.</p>;
  const r = resident.data;

  return (
    <Tabs defaultValue="datos" className="flex flex-col gap-2">
      <TabsList>
        <TabsTrigger value="datos">Datos</TabsTrigger>
        <TabsTrigger value="escalas">Escalas</TabsTrigger>
        <TabsTrigger value="contactos">Contactos</TabsTrigger>
        <TabsTrigger value="alergias">Alergias</TabsTrigger>
        <TabsTrigger value="diagnosticos">Diagnósticos</TabsTrigger>
      </TabsList>

      {/* Datos personales */}
      <TabsContent value="datos">
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Datos personales</CardTitle>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-slate-500">Nacimiento</dt>
                <dd>{fmtDate(r.birthDate)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-slate-500">Ingreso</dt>
                <dd>{fmtDate(r.admissionDate)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-slate-500">DNI/NIE</dt>
                <dd>{r.nationalId ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-slate-500">Centro</dt>
                <dd>{r.center.name}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-slate-500">Plaza</dt>
                <dd>{r.bed ? `${r.bed.code} (${r.bed.unit.name})` : 'Sin plaza'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Escalas */}
      <TabsContent value="escalas">
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
                className="mt-3 flex flex-wrap items-start gap-3"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = assessmentForm.validate({ score: assessment.score });
                  if (!data) return;
                  addAssessment.mutate({ residentId, type: assessment.type, score: data.score });
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
                    inputMode="numeric"
                    min={0}
                    max={assessmentMax}
                    aria-invalid={Boolean(assessmentForm.errors.score)}
                    value={assessment.score}
                    onChange={(e) => setAssessment((s) => ({ ...s, score: e.target.value }))}
                  />
                  <FieldError>{assessmentForm.errors.score}</FieldError>
                </div>
                <div className="self-end">
                  <Button type="submit" disabled={addAssessment.isPending}>
                    Registrar valoración
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Contactos */}
      <TabsContent value="contactos">
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
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = contactForm.validate({ name: contact.name, phone: contact.phone });
                  if (!data) return;
                  addContact.mutate({
                    residentId,
                    name: data.name,
                    relation: contact.relation as ContactRelation,
                    phone: contact.phone || undefined,
                  });
                }}
              >
                <div>
                  <Input
                    placeholder="Nombre"
                    aria-label="Nombre"
                    aria-invalid={Boolean(contactForm.errors.name)}
                    value={contact.name}
                    onChange={(e) => setContact((s) => ({ ...s, name: e.target.value }))}
                  />
                  <FieldError>{contactForm.errors.name}</FieldError>
                </div>
                <div className="flex gap-2">
                  <Select
                    aria-label="Parentesco"
                    value={contact.relation}
                    onChange={(e) => setContact((s) => ({ ...s, relation: e.target.value }))}
                  >
                    {Object.entries(CONTACT_RELATION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <div className="flex-1">
                    <Input
                      placeholder="Teléfono"
                      aria-label="Teléfono"
                      inputMode="tel"
                      aria-invalid={Boolean(contactForm.errors.phone)}
                      value={contact.phone}
                      onChange={(e) => setContact((s) => ({ ...s, phone: e.target.value }))}
                    />
                  </div>
                </div>
                <FieldError>{contactForm.errors.phone}</FieldError>
                <Button type="submit" size="sm" disabled={addContact.isPending} className="self-start">
                  Añadir contacto
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Alergias */}
      <TabsContent value="alergias">
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
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = allergyForm.validate({ substance: allergy.substance });
                  if (!data) return;
                  addAllergy.mutate({
                    residentId,
                    substance: data.substance,
                    severity: (allergy.severity || undefined) as AllergySeverity | undefined,
                  });
                }}
              >
                <div>
                  <Input
                    placeholder="Sustancia"
                    aria-label="Sustancia"
                    aria-invalid={Boolean(allergyForm.errors.substance)}
                    value={allergy.substance}
                    onChange={(e) => setAllergy((s) => ({ ...s, substance: e.target.value }))}
                  />
                  <FieldError>{allergyForm.errors.substance}</FieldError>
                </div>
                <Select
                  aria-label="Gravedad"
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
                <Button type="submit" size="sm" disabled={addAllergy.isPending} className="self-start">
                  Añadir alergia
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Diagnósticos */}
      <TabsContent value="diagnosticos">
        <Card>
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
                className="mt-3 flex flex-wrap items-start gap-2"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = diagnosisForm.validate({ description: diagnosis.description });
                  if (!data) return;
                  addDiagnosis.mutate({ residentId, description: data.description, code: diagnosis.code || undefined });
                }}
              >
                <div className="flex-1">
                  <Input
                    placeholder="Descripción"
                    aria-label="Descripción"
                    aria-invalid={Boolean(diagnosisForm.errors.description)}
                    value={diagnosis.description}
                    onChange={(e) => setDiagnosis((s) => ({ ...s, description: e.target.value }))}
                  />
                  <FieldError>{diagnosisForm.errors.description}</FieldError>
                </div>
                <Input
                  placeholder="CIE-10"
                  aria-label="Código CIE-10"
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
      </TabsContent>
    </Tabs>
  );
}
