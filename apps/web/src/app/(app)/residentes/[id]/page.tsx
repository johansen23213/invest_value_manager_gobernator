'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  FieldError,
  Input,
  Label,
  Select,
  SectionCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetlla/ui';
import type { AllergySeverity, ContactRelation, DeviceType, UPPOrigin, RestraintType, ConsentType } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import { SCALE_RANGES, type ScaleType } from '@/lib/scales';
import {
  ALLERGY_SEVERITY_LABELS,
  ASSESSMENT_TYPE_LABELS,
  CONSENT_TYPE_LABELS,
  CONTACT_RELATION_LABELS,
  DEVICE_TYPE_LABELS,
  DIET_TYPE_LABELS,
  LIQUID_TEXTURE_LABELS,
  PLACE_REGIME_LABELS,
  RESTRAINT_TYPE_LABELS,
  UPP_ORIGIN_LABELS,
} from '@/lib/labels';
import { NursingNotesTab } from './nursing-notes-tab';
import { MedicalNotesTab } from './medical-notes-tab';
import { DischargeTab } from './discharge-tab';
import { SocialTab } from './social-tab';
import { WellbeingTab } from './wellbeing-tab';
import { ScaleEvolutionChart } from './scale-evolution-chart';

// ---------------------------------------------------------------------------
// Esquemas de validación (reutilizan / complementan los del backend)
// ---------------------------------------------------------------------------

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

const deviceSchema = z.object({
  description: z.string().max(300).optional(),
  notes: z.string().max(500).optional(),
});

const vaccineSchema = z.object({
  type: z.string().trim().min(1, 'Indica el tipo de vacuna.').max(80),
  lot: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

const weightSchema = z.object({
  weightKg: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Introduce el peso.' }).positive('Debe ser positivo.').max(300),
  ),
  heightCm: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().positive().max(250).optional(),
  ),
  notes: z.string().max(300).optional(),
});

const uppSchema = z.object({
  location: z.string().trim().min(1, 'Indica la localización.').max(120),
  stage: z.preprocess(
    (v) => Number(v),
    z.number().int().min(1).max(4),
  ),
  notes: z.string().max(500).optional(),
});

const curingSchema = z.object({
  treatment: z.string().trim().min(1, 'Indica el tratamiento.').max(500),
  evolution: z.string().max(100).optional(),
});

const fallSchema = z.object({
  location: z.string().max(120).optional(),
  circumstances: z.string().max(500).optional(),
  injuries: z.string().max(500).optional(),
  measures: z.string().max(500).optional(),
});

const restraintSchema = z.object({
  justification: z.string().trim().min(10, 'La justificación debe tener al menos 10 caracteres.').max(1000),
  consentBy: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

const reviewRestraintSchema = z.object({
  notes: z.string().trim().min(1, 'Indica las notas de la revisión.').max(500),
});

const endRestraintSchema = z.object({
  endReason: z.string().trim().min(1, 'Indica el motivo de finalización.').max(500),
});

const consentSchema = z.object({
  grantedBy: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

const lifeStorySchema = z.object({
  profession: z.string().max(200).optional(),
  hobbies: z.string().max(1000).optional(),
  music: z.string().max(500).optional(),
  importantPeople: z.string().max(1000).optional(),
  religion: z.string().max(500).optional(),
  preferences: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ResidentDetailPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const { locale, t } = useT();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);
  const toast = useToast();
  const confirm = useConfirm();
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('residents:write') ?? false;
  const canClinical = me.data?.permissions.includes('clinical:write') ?? false;
  const canDsar = me.data?.permissions.includes('dsar:manage') ?? false;
  const canCareRead = me.data?.permissions.includes('care:read') ?? false;
  const canCareWrite = me.data?.permissions.includes('care:write') ?? false;
  const canResidentsRead = me.data?.permissions.includes('residents:read') ?? false;
  const resident = api.residents.get.useQuery({ id: residentId });

  // Clínico+: datos adicionales
  const devices = api.clinical.listDevices.useQuery({ residentId });
  const vaccines = api.clinical.listVaccines.useQuery({ residentId });
  const weights = api.clinical.listWeights.useQuery({ residentId });
  const ulcers = api.clinical.listPressureUlcers.useQuery({ residentId });
  const falls = api.clinical.listFalls.useQuery({ residentId });
  const restraints = api.clinical.listRestraints.useQuery({ residentId });
  const consents = api.clinical.listConsents.useQuery({ residentId });
  const lifeStory = api.clinical.getLifeStory.useQuery({ residentId });

  const refresh = () => utils.residents.get.invalidate({ id: residentId });
  const refreshClinical = async () => {
    await Promise.all([
      utils.clinical.listDevices.invalidate({ residentId }),
      utils.clinical.listVaccines.invalidate({ residentId }),
      utils.clinical.listWeights.invalidate({ residentId }),
      utils.clinical.listPressureUlcers.invalidate({ residentId }),
      utils.clinical.listFalls.invalidate({ residentId }),
      utils.clinical.listRestraints.invalidate({ residentId }),
      utils.clinical.listConsents.invalidate({ residentId }),
    ]);
  };

  // ── DSAR ──────────────────────────────────────────────────────────────────
  const [dsarConfirmLastName, setDsarConfirmLastName] = useState('');
  const [dsarReason, setDsarReason] = useState('');
  const exportDsar = api.dsar.exportResident.useMutation({
    onSuccess: ({ data, sha256 }) => {
      const blob = new Blob([JSON.stringify({ sha256, ...data }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dsar-export-${residentId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exportación generada y descargada.');
    },
    onError: (e) => toast.error(e.message),
  });
  const anonymize = api.dsar.anonymizeResident.useMutation({
    onSuccess: async (res) => {
      setDsarConfirmLastName('');
      setDsarReason('');
      await refresh();
      toast.success(`Residente anonimizado (${res.pseudonym}).`);
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleAnonymize() {
    const ok = await confirm({
      title: 'Suprimir datos del residente (art. 17)',
      description:
        'Operación IRREVERSIBLE: se elimina la identificación directa (nombre, DNI, fecha de nacimiento), se borran contactos y vínculos familiares. Los registros clínicos se conservan anonimizados según la política de retención sanitaria.',
      confirmLabel: 'Anonimizar definitivamente',
      tone: 'danger',
    });
    if (ok) {
      anonymize.mutate({
        residentId,
        confirmLastName: dsarConfirmLastName,
        reason: dsarReason,
      });
    }
  }

  // ── CONTACTOS ─────────────────────────────────────────────────────────────
  const [contact, setContact] = useState({ name: '', relation: 'HIJO_A', phone: '' });
  const contactForm = useZodForm(contactSchema);
  const addContact = api.residents.addContact.useMutation({
    onSuccess: async () => {
      setContact({ name: '', relation: 'HIJO_A', phone: '' });
      contactForm.clearErrors();
      await refresh();
      toast.success('Contacto añadido.');
    },
    onError: (e) => toast.error(e.message),
  });

  // ── ALERGIAS ──────────────────────────────────────────────────────────────
  const [allergy, setAllergy] = useState({ substance: '', severity: '' });
  const allergyForm = useZodForm(allergySchema);
  const addAllergy = api.residents.addAllergy.useMutation({
    onSuccess: async () => {
      setAllergy({ substance: '', severity: '' });
      allergyForm.clearErrors();
      await refresh();
      toast.success('Alergia añadida.');
    },
    onError: (e) => toast.error(e.message),
  });

  // ── DIAGNÓSTICOS ──────────────────────────────────────────────────────────
  const [diagnosis, setDiagnosis] = useState({ description: '', code: '' });
  const diagnosisForm = useZodForm(diagnosisSchema);
  const addDiagnosis = api.residents.addDiagnosis.useMutation({
    onSuccess: async () => {
      setDiagnosis({ description: '', code: '' });
      diagnosisForm.clearErrors();
      await refresh();
      toast.success('Diagnóstico añadido.');
    },
    onError: (e) => toast.error(e.message),
  });

  // ── ESCALAS ───────────────────────────────────────────────────────────────
  const ALL_SCALE_TYPES = Object.keys(SCALE_RANGES) as ScaleType[];
  const [assessment, setAssessment] = useState({ type: 'BARTHEL' as ScaleType, score: '' });
  const assessmentMax = SCALE_RANGES[assessment.type].max;
  const assessmentMin = SCALE_RANGES[assessment.type].min;
  const assessmentSchema = z.object({
    score: z.preprocess(
      (v) => (v === '' || v == null ? undefined : Number(v)),
      z
        .number({ invalid_type_error: 'Introduce una puntuación.' })
        .int('Debe ser un número entero.')
        .min(assessmentMin, `Mínimo ${assessmentMin}.`)
        .max(assessmentMax, `Máximo ${assessmentMax}.`),
    ),
  });
  const assessmentForm = useZodForm(assessmentSchema);
  // Para Norton/Braden usamos addAssessmentWithAlert
  const isUppScale = assessment.type === 'NORTON' || assessment.type === 'BRADEN';
  const addAssessmentWithAlert = api.clinical.addAssessmentWithAlert.useMutation({
    onSuccess: async ({ uppRiskAlert }) => {
      setAssessment((s) => ({ ...s, score: '' }));
      assessmentForm.clearErrors();
      await refresh();
      toast.success('Valoración registrada.');
      if (uppRiskAlert) {
        toast.error('ALERTA: riesgo alto de UPP. Activar protocolo de prevención.');
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const addAssessment = api.residents.addAssessment.useMutation({
    onSuccess: async () => {
      setAssessment((s) => ({ ...s, score: '' }));
      assessmentForm.clearErrors();
      await refresh();
      toast.success('Valoración registrada.');
    },
    onError: (e) => toast.error(e.message),
  });
  function handleAddAssessment(score: number) {
    if (isUppScale) {
      addAssessmentWithAlert.mutate({
        residentId,
        type: assessment.type as 'NORTON' | 'BRADEN',
        score,
      });
    } else {
      addAssessment.mutate({ residentId, type: assessment.type, score });
    }
  }

  // ── CUIDADOS ──────────────────────────────────────────────────────────────
  const r = resident.data;
  const [careForm, setCareForm] = useState({
    dietType: '',
    liquidTexture: '',
    nutritionSupplements: '',
    continenceType: '',
    absorbentSize: '',
    wanderingRisk: false,
    fallRisk: false,
  });
  // Inicializar desde r cuando carga
  const [careFormInit, setCareFormInit] = useState(false);
  if (r && !careFormInit) {
    setCareForm({
      dietType: r.dietType ?? '',
      liquidTexture: r.liquidTexture ?? '',
      nutritionSupplements: r.nutritionSupplements ?? '',
      continenceType: r.continenceType ?? '',
      absorbentSize: r.absorbentSize ?? '',
      wanderingRisk: r.wanderingRisk ?? false,
      fallRisk: r.fallRisk ?? false,
    });
    setCareFormInit(true);
  }
  const updateResident = api.residents.update.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t('exp.care.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── DISPOSITIVOS ──────────────────────────────────────────────────────────
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [deviceType, setDeviceType] = useState<string>('SONDA_VESICAL');
  const [deviceFields, setDeviceFields] = useState({ description: '', notes: '' });
  const deviceForm = useZodForm(deviceSchema);
  const addDevice = api.clinical.addDevice.useMutation({
    onSuccess: async () => {
      setDeviceDialogOpen(false);
      setDeviceFields({ description: '', notes: '' });
      await refreshClinical();
      toast.success(t('exp.clinical.devices.added'));
    },
    onError: (e) => toast.error(e.message),
  });
  const retireDevice = api.clinical.retireDevice.useMutation({
    onSuccess: async () => {
      await refreshClinical();
      toast.success(t('exp.clinical.devices.retired'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── VACUNAS ───────────────────────────────────────────────────────────────
  const [vaccineDialogOpen, setVaccineDialogOpen] = useState(false);
  const [vaccineFields, setVaccineFields] = useState({ type: '', date: '', lot: '', notes: '' });
  const vaccineForm = useZodForm(vaccineSchema);
  const addVaccine = api.clinical.addVaccine.useMutation({
    onSuccess: async () => {
      setVaccineDialogOpen(false);
      setVaccineFields({ type: '', date: '', lot: '', notes: '' });
      vaccineForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.vaccines.added'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── PESO ──────────────────────────────────────────────────────────────────
  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [weightFields, setWeightFields] = useState({ weightKg: '', heightCm: '', notes: '', date: '' });
  const weightForm = useZodForm(weightSchema);
  const addWeight = api.clinical.addWeight.useMutation({
    onSuccess: async () => {
      setWeightDialogOpen(false);
      setWeightFields({ weightKg: '', heightCm: '', notes: '', date: '' });
      weightForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.weight.added'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── UPP ───────────────────────────────────────────────────────────────────
  const [uppDialogOpen, setUppDialogOpen] = useState(false);
  const [uppFields, setUppFields] = useState({ location: '', stage: '1', onsetDate: '', acquired: 'INGRESO', notes: '' });
  const uppForm = useZodForm(uppSchema);
  const addUlcer = api.clinical.addPressureUlcer.useMutation({
    onSuccess: async () => {
      setUppDialogOpen(false);
      setUppFields({ location: '', stage: '1', onsetDate: '', acquired: 'INGRESO', notes: '' });
      uppForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.upp.added'));
    },
    onError: (e) => toast.error(e.message),
  });
  const resolveUlcer = api.clinical.resolveUlcer.useMutation({
    onSuccess: async () => {
      await refreshClinical();
      toast.success(t('exp.clinical.upp.resolved'));
    },
    onError: (e) => toast.error(e.message),
  });

  // Cura de UPP
  const [curingDialogOpen, setCuringDialogOpen] = useState(false);
  const [activeCuringUlcerId, setActiveCuringUlcerId] = useState('');
  const [curingFields, setCuringFields] = useState({ treatment: '', evolution: '', date: '' });
  const curingForm = useZodForm(curingSchema);
  const addCuring = api.clinical.addCuring.useMutation({
    onSuccess: async () => {
      setCuringDialogOpen(false);
      setCuringFields({ treatment: '', evolution: '', date: '' });
      curingForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.upp.curing.added'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── CAÍDAS ────────────────────────────────────────────────────────────────
  const [fallDialogOpen, setFallDialogOpen] = useState(false);
  const [fallFields, setFallFields] = useState({
    occurredAt: '',
    location: '',
    circumstances: '',
    injuries: '',
    measures: '',
    witnessed: false,
  });
  const fallForm = useZodForm(fallSchema);
  const addFall = api.clinical.addFall.useMutation({
    onSuccess: async () => {
      setFallDialogOpen(false);
      setFallFields({ occurredAt: '', location: '', circumstances: '', injuries: '', measures: '', witnessed: false });
      fallForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.falls.added'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── SUJECIONES ────────────────────────────────────────────────────────────
  const [restraintDialogOpen, setRestraintDialogOpen] = useState(false);
  const [restraintType, setRestraintType] = useState<string>('BARANDILLAS');
  const [restraintFields, setRestraintFields] = useState({
    justification: '',
    prescribedAt: '',
    consentObtained: false,
    consentDate: '',
    consentBy: '',
    notes: '',
  });
  const restraintForm = useZodForm(restraintSchema);
  const addRestraint = api.clinical.addRestraint.useMutation({
    onSuccess: async () => {
      setRestraintDialogOpen(false);
      setRestraintFields({ justification: '', prescribedAt: '', consentObtained: false, consentDate: '', consentBy: '', notes: '' });
      restraintForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.restraints.added'));
    },
    onError: (e) => toast.error(e.message),
  });
  // Revisión de sujeción
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [activeRestraintId, setActiveRestraintId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const reviewForm = useZodForm(reviewRestraintSchema);
  const reviewRestraint = api.clinical.reviewRestraint.useMutation({
    onSuccess: async () => {
      setReviewDialogOpen(false);
      setReviewNotes('');
      reviewForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.restraints.reviewed'));
    },
    onError: (e) => toast.error(e.message),
  });
  // Fin de sujeción
  const [endRestraintDialogOpen, setEndRestraintDialogOpen] = useState(false);
  const [endReasonFields, setEndReasonFields] = useState({ endReason: '', endDate: '' });
  const endRestraintForm = useZodForm(endRestraintSchema);
  const endRestraint = api.clinical.endRestraint.useMutation({
    onSuccess: async () => {
      setEndRestraintDialogOpen(false);
      setEndReasonFields({ endReason: '', endDate: '' });
      endRestraintForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.restraints.ended'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── CONSENTIMIENTOS ───────────────────────────────────────────────────────
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentType, setConsentType] = useState<string>('INGRESO');
  const [consentGranted, setConsentGranted] = useState(true);
  const [consentFields, setConsentFields] = useState({ grantedBy: '', date: '', notes: '' });
  const consentForm = useZodForm(consentSchema);
  const addConsent = api.clinical.addConsent.useMutation({
    onSuccess: async () => {
      setConsentDialogOpen(false);
      setConsentFields({ grantedBy: '', date: '', notes: '' });
      consentForm.clearErrors();
      await refreshClinical();
      toast.success(t('exp.clinical.consents.added'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── HISTORIA DE VIDA ──────────────────────────────────────────────────────
  const [lifeStoryFields, setLifeStoryFields] = useState({
    profession: '', hobbies: '', music: '', importantPeople: '', religion: '', preferences: '', notes: '',
  });
  const [lifeStoryInit, setLifeStoryInit] = useState(false);
  const lsData = lifeStory.data;
  if (lsData && !lifeStoryInit) {
    setLifeStoryFields({
      profession: lsData.profession ?? '',
      hobbies: lsData.hobbies ?? '',
      music: lsData.music ?? '',
      importantPeople: lsData.importantPeople ?? '',
      religion: lsData.religion ?? '',
      preferences: lsData.preferences ?? '',
      notes: lsData.notes ?? '',
    });
    setLifeStoryInit(true);
  }
  const lifeStoryForm = useZodForm(lifeStorySchema);
  const upsertLifeStory = api.clinical.upsertLifeStory.useMutation({
    onSuccess: async () => {
      await utils.clinical.getLifeStory.invalidate({ residentId });
      toast.success(t('exp.clinical.lifeStory.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── DATOS ADMINISTRATIVOS ─────────────────────────────────────────────────
  const [adminFields, setAdminFields] = useState({
    cip: '', socialSecurityNo: '', placeRegime: '', legalRepName: '', legalRepPhone: '',
    legalRepEmail: '', judicialCapacity: true, advanceDirectives: false, advanceDirLocation: '',
  });
  const [adminInit, setAdminInit] = useState(false);
  if (r && !adminInit) {
    setAdminFields({
      cip: r.cip ?? '',
      socialSecurityNo: r.socialSecurityNo ?? '',
      placeRegime: r.placeRegime ?? 'PRIVADA',
      legalRepName: r.legalRepName ?? '',
      legalRepPhone: r.legalRepPhone ?? '',
      legalRepEmail: r.legalRepEmail ?? '',
      judicialCapacity: r.judicialCapacity ?? true,
      advanceDirectives: r.advanceDirectives ?? false,
      advanceDirLocation: r.advanceDirLocation ?? '',
    });
    setAdminInit(true);
  }

  if (resident.isLoading) return <p className="text-[#1A3A3F]/60">Cargando…</p>;
  if (!r) return <p className="text-[#1A3A3F]/60">Residente no encontrado.</p>;

  const today = new Date().toISOString().split('T')[0]!;

  return (
    <Tabs defaultValue="datos" className="flex flex-col gap-2">
      <TabsList>
        <TabsTrigger value="datos">Datos</TabsTrigger>
        <TabsTrigger value="escalas">Escalas</TabsTrigger>
        <TabsTrigger value="contactos">Contactos</TabsTrigger>
        <TabsTrigger value="alergias">Alergias</TabsTrigger>
        <TabsTrigger value="diagnosticos">Diagnósticos</TabsTrigger>
        <TabsTrigger value="cuidados">{t('exp.care.title')}</TabsTrigger>
        <TabsTrigger value="clinico">{t('exp.clinical.title')}</TabsTrigger>
        {canCareRead && <TabsTrigger value="enfermeria">{t('exp.nursing.title')}</TabsTrigger>}
        {canResidentsRead && <TabsTrigger value="evolucion">{t('exp.medical.title')}</TabsTrigger>}
        <TabsTrigger value="administrativo">{t('exp.admin.title')}</TabsTrigger>
        {canResidentsRead && <TabsTrigger value="social">{t('exp.social.title')}</TabsTrigger>}
        {canResidentsRead && <TabsTrigger value="bienestar">{t('exp.wellbeing.title')}</TabsTrigger>}
        {canWrite && <TabsTrigger value="bajas">{t('exp.discharge.title')}</TabsTrigger>}
        {canDsar && <TabsTrigger value="rgpd">RGPD</TabsTrigger>}
      </TabsList>

      {/* ── DATOS PERSONALES ─────────────────────────────────────────────── */}
      <TabsContent value="datos">
        <SectionCard title="Datos personales">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                <dt className="text-[#1A3A3F]/60">Nacimiento</dt>
                <dd>{fmtDate(r.birthDate)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                <dt className="text-[#1A3A3F]/60">Ingreso</dt>
                <dd>{fmtDate(r.admissionDate)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                <dt className="text-[#1A3A3F]/60">DNI/NIE</dt>
                <dd>{r.nationalId ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                <dt className="text-[#1A3A3F]/60">Centro</dt>
                <dd>{r.center.name}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                <dt className="text-[#1A3A3F]/60">Plaza</dt>
                <dd>{r.bed ? `${r.bed.code} (${r.bed.unit.name})` : 'Sin plaza'}</dd>
              </div>
              {r.bloodGroup && (
                <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                  <dt className="text-[#1A3A3F]/60">Grupo sanguíneo</dt>
                  <dd>{r.bloodGroup}</dd>
                </div>
              )}
              {r.preferredLanguage && (
                <div className="flex justify-between gap-2 border-b border-brand-100/60 py-1">
                  <dt className="text-[#1A3A3F]/60">Idioma preferente</dt>
                  <dd>{r.preferredLanguage}</dd>
                </div>
              )}
            </dl>
        </SectionCard>
      </TabsContent>

      {/* ── ESCALAS ──────────────────────────────────────────────────────── */}
      <TabsContent value="escalas">
        <div className="flex flex-col gap-4">
          {/* Registrar nueva valoración */}
          <SectionCard title="Escalas de valoración">
              {r.assessments.length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">Sin valoraciones.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {r.assessments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-md bg-brand-50 px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{ASSESSMENT_TYPE_LABELS[a.type] ?? a.type}</span>:{' '}
                        {a.score}/{SCALE_RANGES[a.type as ScaleType]?.max ?? '?'}
                      </span>
                      <span className="text-[#1A3A3F]/40">{fmtDate(a.assessedAt)}</span>
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
                    handleAddAssessment(data.score as number);
                  }}
                >
                  <div>
                    <Label htmlFor="aType">Escala</Label>
                    <Select
                      id="aType"
                      value={assessment.type}
                      onChange={(e) => {
                        setAssessment({ type: e.target.value as ScaleType, score: '' });
                        assessmentForm.clearErrors();
                      }}
                    >
                      {ALL_SCALE_TYPES.map((st) => (
                        <option key={st} value={st}>
                          {ASSESSMENT_TYPE_LABELS[st] ?? st} ({SCALE_RANGES[st].min}–{SCALE_RANGES[st].max})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="aScore">Puntuación</Label>
                    <Input
                      id="aScore"
                      type="number"
                      inputMode="numeric"
                      min={assessmentMin}
                      max={assessmentMax}
                      aria-invalid={Boolean(assessmentForm.errors.score)}
                      aria-describedby={assessmentForm.errors.score ? 'aScore-err' : undefined}
                      value={assessment.score}
                      onChange={(e) => setAssessment((s) => ({ ...s, score: e.target.value }))}
                    />
                    <FieldError id="aScore-err">{assessmentForm.errors.score}</FieldError>
                    {isUppScale && (
                      <p className="mt-1 text-xs text-amber-700">
                        {assessment.type === 'NORTON' ? 'Norton ≤14 = riesgo alto UPP' : 'Braden ≤18 = riesgo UPP'}
                      </p>
                    )}
                  </div>
                  <div className="self-end">
                    <Button
                      type="submit"
                      disabled={addAssessment.isPending || addAssessmentWithAlert.isPending}
                    >
                      Registrar valoración
                    </Button>
                  </div>
                </form>
              )}
          </SectionCard>

          {/* Gráfico de evolución temporal — requiere residents:read */}
          {canResidentsRead && (
            <SectionCard title="Evolución de escalas">
              <ScaleEvolutionChart residentId={residentId} />
            </SectionCard>
          )}
        </div>
      </TabsContent>

      {/* ── CONTACTOS ────────────────────────────────────────────────────── */}
      <TabsContent value="contactos">
        <SectionCard title="Contactos">
            {r.contacts.length === 0 ? (
              <p className="text-sm text-[#1A3A3F]/60">Sin contactos.</p>
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
                      <option key={k} value={k}>{v}</option>
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
        </SectionCard>
      </TabsContent>

      {/* ── ALERGIAS ─────────────────────────────────────────────────────── */}
      <TabsContent value="alergias">
        <SectionCard title="Alergias">
            {r.allergies.length === 0 ? (
              <p className="text-sm text-[#1A3A3F]/60">Sin alergias registradas.</p>
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
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
                <Button type="submit" size="sm" disabled={addAllergy.isPending} className="self-start">
                  Añadir alergia
                </Button>
              </form>
            )}
        </SectionCard>
      </TabsContent>

      {/* ── DIAGNÓSTICOS ─────────────────────────────────────────────────── */}
      <TabsContent value="diagnosticos">
        <SectionCard title="Diagnósticos">
            {r.diagnoses.length === 0 ? (
              <p className="text-sm text-[#1A3A3F]/60">Sin diagnósticos.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {r.diagnoses.map((d) => (
                  <li key={d.id}>
                    {d.code ? <span className="text-[#1A3A3F]/40">[{d.code}] </span> : null}
                    {d.description} <span className="text-[#1A3A3F]/40">· {fmtDate(d.diagnosedAt)}</span>
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
        </SectionCard>
      </TabsContent>

      {/* ── CUIDADOS ─────────────────────────────────────────────────────── */}
      <TabsContent value="cuidados">
        <div className="flex flex-col gap-4">
          {/* Dieta y nutrición */}
          <SectionCard title={t('exp.care.diet')}>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <Label htmlFor="dietType">{t('exp.care.dietType')}</Label>
                  <Select
                    id="dietType"
                    value={careForm.dietType}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, dietType: e.target.value }))}
                  >
                    <option value="">{t('exp.care.notSet')}</option>
                    {Object.entries(DIET_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="liquidTexture">{t('exp.care.liquidTexture')}</Label>
                  <Select
                    id="liquidTexture"
                    value={careForm.liquidTexture}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, liquidTexture: e.target.value }))}
                  >
                    <option value="">{t('exp.care.notSet')}</option>
                    {Object.entries(LIQUID_TEXTURE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="supplements">{t('exp.care.supplements')}</Label>
                  <Input
                    id="supplements"
                    placeholder="Ensure, Fortimel…"
                    value={careForm.nutritionSupplements}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, nutritionSupplements: e.target.value }))}
                  />
                </div>
              </div>
          </SectionCard>

          {/* Continencia */}
          <SectionCard title={t('exp.care.continence')}>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <Label htmlFor="continenceType">{t('exp.care.continenceType')}</Label>
                  <Input
                    id="continenceType"
                    placeholder="absorbente / sonda / control esfínteres"
                    value={careForm.continenceType}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, continenceType: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="absorbentSize">{t('exp.care.absorbentSize')}</Label>
                  <Input
                    id="absorbentSize"
                    placeholder="S / M / L / XL"
                    value={careForm.absorbentSize}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, absorbentSize: e.target.value }))}
                  />
                </div>
              </div>
          </SectionCard>

          {/* Riesgos */}
          <SectionCard title={t('exp.care.risks')}>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded accent-brand-600"
                    checked={careForm.wanderingRisk}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, wanderingRisk: e.target.checked }))}
                  />
                  <span className="font-medium text-[#1A3A3F]">{t('exp.care.wanderingRisk')}</span>
                  {careForm.wanderingRisk && (
                    <Badge tone="red">Activo</Badge>
                  )}
                </label>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded accent-brand-600"
                    checked={careForm.fallRisk}
                    disabled={!canWrite && !canClinical}
                    onChange={(e) => setCareForm((s) => ({ ...s, fallRisk: e.target.checked }))}
                  />
                  <span className="font-medium text-[#1A3A3F]">{t('exp.care.fallRisk')}</span>
                  {careForm.fallRisk && (
                    <Badge tone="amber">Activo</Badge>
                  )}
                </label>
              </div>
          </SectionCard>

          {(canWrite || canClinical) && (
            <Button
              onClick={() =>
                updateResident.mutate({
                  id: residentId,
                  dietType: (careForm.dietType || undefined) as import('@vetlla/db').DietType | undefined,
                  liquidTexture: (careForm.liquidTexture || undefined) as import('@vetlla/db').LiquidTexture | undefined,
                  nutritionSupplements: careForm.nutritionSupplements || undefined,
                  continenceType: careForm.continenceType || undefined,
                  absorbentSize: careForm.absorbentSize || undefined,
                  wanderingRisk: careForm.wanderingRisk,
                  fallRisk: careForm.fallRisk,
                })
              }
              disabled={updateResident.isPending}
              className="self-start"
            >
              {updateResident.isPending ? 'Guardando…' : t('exp.care.saved').replace('actualizada', 'guardar')}
            </Button>
          )}
        </div>
      </TabsContent>

      {/* ── CLÍNICO+ ─────────────────────────────────────────────────────── */}
      <TabsContent value="clinico">
        <div className="flex flex-col gap-4">

          {/* Dispositivos */}
          <SectionCard
            title={t('exp.clinical.devices')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setDeviceDialogOpen(true)}>
                {t('exp.clinical.devices.add')}
              </Button>
            ) : undefined}
          >
              {devices.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (devices.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.devices.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {(devices.data ?? []).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-brand-50 px-3 py-2">
                      <div>
                        <Badge tone={d.active ? 'neutral' : 'amber'}>
                          {DEVICE_TYPE_LABELS[d.type] ?? d.type}
                        </Badge>
                        {d.description && <span className="ml-2 text-[#1A3A3F]/70">{d.description}</span>}
                        {d.since && <span className="ml-2 text-[#1A3A3F]/40">desde {fmtDate(d.since)}</span>}
                        {!d.active && <Badge tone="amber" className="ml-2">Retirado</Badge>}
                      </div>
                      {canClinical && d.active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Retirar dispositivo',
                              description: `Marcar ${DEVICE_TYPE_LABELS[d.type] ?? d.type} como retirado. Quedará en el historial.`,
                              confirmLabel: t('exp.clinical.devices.retire'),
                            });
                            if (ok) retireDevice.mutate({ id: d.id });
                          }}
                        >
                          {t('exp.clinical.devices.retire')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* Vacunas */}
          <SectionCard
            title={t('exp.clinical.vaccines')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setVaccineDialogOpen(true)}>
                {t('exp.clinical.vaccines.add')}
              </Button>
            ) : undefined}
          >
              {vaccines.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (vaccines.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.vaccines.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {(vaccines.data ?? []).map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 border-b border-brand-100/40 py-1 last:border-0">
                      <strong className="text-[#1A3A3F]">{v.type}</strong>
                      <span className="text-[#1A3A3F]/60">{fmtDate(v.date)}</span>
                      {v.lot && <span className="text-[#1A3A3F]/40">Lote: {v.lot}</span>}
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* Registro de peso */}
          <SectionCard
            title={t('exp.clinical.weight')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setWeightDialogOpen(true)}>
                {t('exp.clinical.weight.add')}
              </Button>
            ) : undefined}
          >
              {weights.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (weights.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.weight.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {(weights.data ?? []).map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center gap-3 border-b border-brand-100/40 py-1 last:border-0">
                      <strong className="text-lg text-[#1A3A3F]">{w.weightKg} kg</strong>
                      {w.bmi && <span className="text-[#1A3A3F]/60">IMC: {w.bmi}</span>}
                      <span className="text-[#1A3A3F]/40">{fmtDate(w.recordedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* UPP */}
          <SectionCard
            title={t('exp.clinical.upp')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setUppDialogOpen(true)}>
                {t('exp.clinical.upp.add')}
              </Button>
            ) : undefined}
          >
              {ulcers.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (ulcers.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.upp.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {(ulcers.data ?? []).map((u) => (
                    <li key={u.id} className="rounded-md border border-brand-100 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={u.active ? 'amber' : 'green'}>
                            {u.active ? t('exp.clinical.upp.active') : t('exp.clinical.upp.resolved.badge')}
                          </Badge>
                          <Badge tone="neutral">
                            {t('exp.clinical.upp.stage', { n: String(u.stage) })}
                          </Badge>
                          <span className="font-medium text-[#1A3A3F]">{u.location}</span>
                          <span className="text-[#1A3A3F]/40">{UPP_ORIGIN_LABELS[u.acquired] ?? u.acquired}</span>
                        </div>
                        {canClinical && u.active && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setActiveCuringUlcerId(u.id);
                                setCuringDialogOpen(true);
                              }}
                            >
                              {t('exp.clinical.upp.curing.add')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Resolver UPP',
                                  description: `Marcar la UPP en ${u.location} (estadio ${u.stage}) como resuelta.`,
                                  confirmLabel: t('exp.clinical.upp.resolve'),
                                });
                                if (ok) {
                                  resolveUlcer.mutate({
                                    id: u.id,
                                    residentId,
                                    resolvedDate: new Date(),
                                  });
                                }
                              }}
                            >
                              {t('exp.clinical.upp.resolve')}
                            </Button>
                          </div>
                        )}
                      </div>
                      {/* Curas */}
                      {u.curings && u.curings.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1 border-l-2 border-brand-100 pl-3 text-xs text-[#1A3A3F]/60">
                          {u.curings.map((c) => (
                            <li key={c.id}>
                              <span className="text-[#1A3A3F]/40">{fmtDate(c.date)}</span>{' '}
                              {c.treatment}
                              {c.evolution ? ` · ${c.evolution}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* Caídas */}
          <SectionCard
            title={t('exp.clinical.falls')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setFallDialogOpen(true)}>
                {t('exp.clinical.falls.add')}
              </Button>
            ) : undefined}
          >
              {falls.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (falls.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.falls.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {(falls.data ?? []).map((f) => (
                    <li key={f.id} className="rounded-md bg-brand-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#1A3A3F]">{fmtDate(f.occurredAt)}</span>
                        {f.location && <span className="text-[#1A3A3F]/60">{f.location}</span>}
                        {f.witnessed && <Badge tone="blue">Presenciada</Badge>}
                      </div>
                      {f.injuries && (
                        <p className="mt-0.5 text-xs text-red-700">Lesiones: {f.injuries}</p>
                      )}
                      {f.circumstances && (
                        <p className="mt-0.5 text-xs text-[#1A3A3F]/60">{f.circumstances}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* Sujeciones mecánicas — REGULADO */}
          <SectionCard
            title={t('exp.clinical.restraints')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setRestraintDialogOpen(true)}>
                {t('exp.clinical.restraints.add')}
              </Button>
            ) : undefined}
          >
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                {t('exp.clinical.restraints.legalNote')}
              </p>
              {restraints.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (restraints.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.restraints.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {(restraints.data ?? []).map((rs) => (
                    <li key={rs.id} className="rounded-md border border-brand-100 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={rs.active ? 'amber' : 'neutral'}>
                            {RESTRAINT_TYPE_LABELS[rs.type] ?? rs.type}
                          </Badge>
                          {!rs.active && <Badge tone="neutral">Finalizada</Badge>}
                          {rs.consentObtained ? (
                            <Badge tone="green">Consentimiento ok</Badge>
                          ) : (
                            <Badge tone="red">Sin consentimiento</Badge>
                          )}
                        </div>
                        {canClinical && rs.active && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setActiveRestraintId(rs.id);
                                setReviewDialogOpen(true);
                              }}
                            >
                              {t('exp.clinical.restraints.review')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setActiveRestraintId(rs.id);
                                setEndRestraintDialogOpen(true);
                              }}
                            >
                              {t('exp.clinical.restraints.end')}
                            </Button>
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#1A3A3F]/70">
                        Motivo: {rs.justification.slice(0, 120)}
                        {rs.justification.length > 120 ? '…' : ''}
                      </p>
                      <p className="text-xs text-[#1A3A3F]/40">
                        Prescrita: {fmtDate(rs.prescribedAt)}
                        {rs.reviewedAt ? ` · Revisada: ${fmtDate(rs.reviewedAt)}` : ''}
                        {rs.endDate ? ` · Finalizada: ${fmtDate(rs.endDate)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* Consentimientos */}
          <SectionCard
            title={t('exp.clinical.consents')}
            aside={canClinical ? (
              <Button size="sm" onClick={() => setConsentDialogOpen(true)}>
                {t('exp.clinical.consents.add')}
              </Button>
            ) : undefined}
          >
              {consents.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
              ) : (consents.data ?? []).length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('exp.clinical.consents.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {(consents.data ?? []).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-brand-100/40 py-1 last:border-0">
                      <Badge tone={c.granted ? 'green' : 'red'}>
                        {c.granted ? 'Concedido' : 'Revocado'}
                      </Badge>
                      <span className="font-medium text-[#1A3A3F]">
                        {CONSENT_TYPE_LABELS[c.type] ?? c.type}
                      </span>
                      {c.grantedBy && <span className="text-[#1A3A3F]/60">{c.grantedBy}</span>}
                      <span className="text-[#1A3A3F]/40">{fmtDate(c.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          {/* Historia de vida */}
          <SectionCard title={t('exp.clinical.lifeStory')}>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {(
                  [
                    ['profession', t('exp.clinical.lifeStory.profession'), 'text'],
                    ['hobbies', t('exp.clinical.lifeStory.hobbies'), 'textarea'],
                    ['music', t('exp.clinical.lifeStory.music'), 'text'],
                    ['importantPeople', t('exp.clinical.lifeStory.importantPeople'), 'textarea'],
                    ['religion', t('exp.clinical.lifeStory.religion'), 'text'],
                    ['preferences', t('exp.clinical.lifeStory.preferences'), 'textarea'],
                    ['notes', t('exp.clinical.lifeStory.notes'), 'textarea'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className={field === 'notes' || field === 'preferences' || field === 'hobbies' || field === 'importantPeople' ? 'sm:col-span-2' : ''}>
                    <Label htmlFor={`ls-${field}`}>{label}</Label>
                    <Input
                      id={`ls-${field}`}
                      value={lifeStoryFields[field]}
                      disabled={!canClinical}
                      onChange={(e) => setLifeStoryFields((s) => ({ ...s, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {canClinical && (
                <Button
                  className="mt-4"
                  disabled={upsertLifeStory.isPending}
                  onClick={() => {
                    const data = lifeStoryForm.validate(lifeStoryFields);
                    if (!data) return;
                    upsertLifeStory.mutate({ residentId, ...data });
                  }}
                >
                  {upsertLifeStory.isPending ? 'Guardando…' : t('exp.clinical.lifeStory.save')}
                </Button>
              )}
          </SectionCard>
        </div>
      </TabsContent>

      {/* ── NOTAS DE ENFERMERÍA ──────────────────────────────────────────── */}
      {canCareRead && (
        <TabsContent value="enfermeria">
          <NursingNotesTab residentId={residentId} canWrite={canCareWrite} />
        </TabsContent>
      )}

      {/* ── EVOLUCIÓN MÉDICA ─────────────────────────────────────────────── */}
      {canResidentsRead && (
        <TabsContent value="evolucion">
          <MedicalNotesTab
            residentId={residentId}
            canRead={canResidentsRead}
            canWrite={canClinical}
          />
        </TabsContent>
      )}

      {/* ── ADMINISTRATIVO ───────────────────────────────────────────────── */}
      <TabsContent value="administrativo">
        <SectionCard title={t('exp.admin.title')}>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <Label htmlFor="adm-cip">{t('exp.admin.cip')}</Label>
                <Input
                  id="adm-cip"
                  value={adminFields.cip}
                  disabled={!canWrite}
                  onChange={(e) => setAdminFields((s) => ({ ...s, cip: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="adm-ss">{t('exp.admin.socialSecurityNo')}</Label>
                <Input
                  id="adm-ss"
                  value={adminFields.socialSecurityNo}
                  disabled={!canWrite}
                  onChange={(e) => setAdminFields((s) => ({ ...s, socialSecurityNo: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="adm-regime">{t('exp.admin.placeRegime')}</Label>
                <Select
                  id="adm-regime"
                  value={adminFields.placeRegime}
                  disabled={!canWrite}
                  onChange={(e) => setAdminFields((s) => ({ ...s, placeRegime: e.target.value }))}
                >
                  {Object.entries(PLACE_REGIME_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium text-[#1A3A3F]">{t('exp.admin.legalRep')}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="adm-legalName">{t('exp.admin.legalRepName')}</Label>
                    <Input
                      id="adm-legalName"
                      value={adminFields.legalRepName}
                      disabled={!canWrite}
                      onChange={(e) => setAdminFields((s) => ({ ...s, legalRepName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="adm-legalPhone">{t('exp.admin.legalRepPhone')}</Label>
                    <Input
                      id="adm-legalPhone"
                      inputMode="tel"
                      value={adminFields.legalRepPhone}
                      disabled={!canWrite}
                      onChange={(e) => setAdminFields((s) => ({ ...s, legalRepPhone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="adm-legalEmail">{t('exp.admin.legalRepEmail')}</Label>
                    <Input
                      id="adm-legalEmail"
                      type="email"
                      inputMode="email"
                      value={adminFields.legalRepEmail}
                      disabled={!canWrite}
                      onChange={(e) => setAdminFields((s) => ({ ...s, legalRepEmail: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-[#1A3A3F]">{t('exp.admin.judicialCapacity')}</p>
                <div className="flex gap-4">
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="judicialCapacity"
                      checked={adminFields.judicialCapacity}
                      disabled={!canWrite}
                      onChange={() => setAdminFields((s) => ({ ...s, judicialCapacity: true }))}
                    />
                    <span>{t('exp.admin.judicialCapacity.yes')}</span>
                  </label>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="judicialCapacity"
                      checked={!adminFields.judicialCapacity}
                      disabled={!canWrite}
                      onChange={() => setAdminFields((s) => ({ ...s, judicialCapacity: false }))}
                    />
                    <span>{t('exp.admin.judicialCapacity.no')}</span>
                  </label>
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-[#1A3A3F]">{t('exp.admin.advanceDirectives')}</p>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand-600"
                    checked={adminFields.advanceDirectives}
                    disabled={!canWrite}
                    onChange={(e) => setAdminFields((s) => ({ ...s, advanceDirectives: e.target.checked }))}
                  />
                  <span>{t('exp.admin.advanceDirectives')}</span>
                </label>
                {adminFields.advanceDirectives && (
                  <div className="mt-2">
                    <Label htmlFor="adm-advDir">{t('exp.admin.advanceDirLocation')}</Label>
                    <Input
                      id="adm-advDir"
                      placeholder="Carpeta azul en caja fuerte..."
                      value={adminFields.advanceDirLocation}
                      disabled={!canWrite}
                      onChange={(e) => setAdminFields((s) => ({ ...s, advanceDirLocation: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </div>
            {canWrite && (
              <Button
                className="mt-4"
                disabled={updateResident.isPending}
                onClick={() =>
                  updateResident.mutate({
                    id: residentId,
                    cip: adminFields.cip || undefined,
                    socialSecurityNo: adminFields.socialSecurityNo || undefined,
                    placeRegime: (adminFields.placeRegime || undefined) as typeof r.placeRegime,
                    legalRepName: adminFields.legalRepName || undefined,
                    legalRepPhone: adminFields.legalRepPhone || undefined,
                    legalRepEmail: adminFields.legalRepEmail || undefined,
                    judicialCapacity: adminFields.judicialCapacity,
                    advanceDirectives: adminFields.advanceDirectives,
                    advanceDirLocation: adminFields.advanceDirLocation || undefined,
                  }, {
                    onSuccess: () => toast.success(t('exp.admin.saved')),
                  })
                }
              >
                {updateResident.isPending ? 'Guardando…' : 'Guardar datos administrativos'}
              </Button>
            )}
        </SectionCard>
      </TabsContent>

      {/* ── RGPD ─────────────────────────────────────────────────────────── */}
      {canDsar && (
        <TabsContent value="rgpd">
          <div className="flex flex-col gap-4">
            <SectionCard title="Derecho de acceso y portabilidad (art. 15 y 20)">
                <p className="mb-3 text-sm text-[#1A3A3F]/70">
                  Genera un fichero JSON con todos los datos que Vetlla guarda de este residente
                  (expediente, atención directa, medicación, PIA y trazas de auditoría), con hash
                  SHA-256 de integridad. La exportación queda registrada en el AuditLog.
                </p>
                <Button
                  onClick={() => exportDsar.mutate({ residentId })}
                  disabled={exportDsar.isPending}
                  data-testid="dsar-export"
                >
                  {exportDsar.isPending ? 'Generando…' : 'Exportar datos del residente'}
                </Button>
            </SectionCard>

            <SectionCard title="Derecho de supresión (art. 17)">
                <p className="mb-3 text-sm text-[#1A3A3F]/70">
                  Anonimización irreversible: elimina nombre, DNI y fecha de nacimiento, borra
                  contactos y vínculos familiares, y libera la plaza. Los registros clínicos se
                  conservan <strong>anonimizados</strong> (obligación de conservación sanitaria;
                  política de retención pendiente de definición — Q-003). El AuditLog no se
                  modifica: es la evidencia de trazabilidad.
                </p>
                <div className="flex flex-col gap-3" style={{ maxWidth: '420px' }}>
                  <div>
                    <Label htmlFor="dsar-confirm">
                      Escribe el apellido del residente para confirmar
                    </Label>
                    <Input
                      id="dsar-confirm"
                      value={dsarConfirmLastName}
                      onChange={(e) => setDsarConfirmLastName(e.target.value)}
                      placeholder={r.lastName}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dsar-reason">Motivo de la solicitud</Label>
                    <Input
                      id="dsar-reason"
                      value={dsarReason}
                      onChange={(e) => setDsarReason(e.target.value)}
                      placeholder="p. ej. solicitud del interesado tras el alta"
                      maxLength={500}
                    />
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => void handleAnonymize()}
                    disabled={
                      anonymize.isPending ||
                      dsarConfirmLastName.trim() === '' ||
                      dsarReason.trim().length < 5
                    }
                    data-testid="dsar-anonymize"
                  >
                    {anonymize.isPending ? 'Anonimizando…' : 'Anonimizar residente (irreversible)'}
                  </Button>
                </div>
            </SectionCard>
          </div>
        </TabsContent>
      )}

      {/* ── SOCIAL ───────────────────────────────────────────────────────── */}
      {canResidentsRead && (
        <TabsContent value="social">
          <SocialTab residentId={residentId} canWrite={canWrite} />
        </TabsContent>
      )}

      {/* ── BIENESTAR ACP ────────────────────────────────────────────────── */}
      {canResidentsRead && (
        <TabsContent value="bienestar">
          <WellbeingTab residentId={residentId} canWrite={canWrite} />
        </TabsContent>
      )}

      {/* ── BAJAS ────────────────────────────────────────────────────────── */}
      {canWrite && (
        <TabsContent value="bajas">
          <DischargeTab
            residentId={residentId}
            residentStatus={r.status}
            canWrite={canWrite}
          />
        </TabsContent>
      )}

      {/* ── DIALOGS ───────────────────────────────────────────────────────── */}

      {/* Añadir dispositivo */}
      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.devices.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = deviceForm.validate(deviceFields);
              if (!data) return;
              addDevice.mutate({
                residentId,
                type: deviceType as DeviceType,
                description: data.description || undefined,
                notes: data.notes || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="dev-type">Tipo de dispositivo</Label>
              <Select id="dev-type" value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>
                {Object.entries(DEVICE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="dev-desc">Descripción (opcional)</Label>
              <Input
                id="dev-desc"
                placeholder="p. ej. Sonda Foley 16F"
                value={deviceFields.description}
                onChange={(e) => setDeviceFields((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addDevice.isPending}>
                {addDevice.isPending ? 'Guardando…' : t('exp.clinical.devices.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Añadir vacuna */}
      <Dialog open={vaccineDialogOpen} onOpenChange={setVaccineDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.vaccines.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = vaccineForm.validate(vaccineFields);
              if (!data) return;
              addVaccine.mutate({
                residentId,
                type: data.type,
                date: new Date(vaccineFields.date),
                lot: data.lot || undefined,
                notes: data.notes || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="vac-type">Tipo de vacuna</Label>
              <Input
                id="vac-type"
                placeholder="gripe, COVID-19, neumococo…"
                aria-invalid={Boolean(vaccineForm.errors.type)}
                value={vaccineFields.type}
                onChange={(e) => setVaccineFields((s) => ({ ...s, type: e.target.value }))}
              />
              <FieldError>{vaccineForm.errors.type}</FieldError>
            </div>
            <div>
              <Label htmlFor="vac-date">Fecha</Label>
              <Input
                id="vac-date"
                type="date"
                max={today}
                value={vaccineFields.date}
                onChange={(e) => setVaccineFields((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="vac-lot">Lote (opcional)</Label>
              <Input
                id="vac-lot"
                value={vaccineFields.lot}
                onChange={(e) => setVaccineFields((s) => ({ ...s, lot: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addVaccine.isPending}>
                {addVaccine.isPending ? 'Guardando…' : t('exp.clinical.vaccines.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Añadir peso */}
      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.weight.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = weightForm.validate(weightFields);
              if (!data) return;
              addWeight.mutate({
                residentId,
                weightKg: data.weightKg as number,
                heightCm: data.heightCm as number | undefined,
                recordedAt: new Date(weightFields.date || today),
                notes: data.notes || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="w-kg">Peso (kg)</Label>
              <Input
                id="w-kg"
                type="number"
                step="0.1"
                inputMode="decimal"
                aria-invalid={Boolean(weightForm.errors.weightKg)}
                value={weightFields.weightKg}
                onChange={(e) => setWeightFields((s) => ({ ...s, weightKg: e.target.value }))}
              />
              <FieldError>{weightForm.errors.weightKg}</FieldError>
            </div>
            <div>
              <Label htmlFor="w-date">Fecha</Label>
              <Input
                id="w-date"
                type="date"
                max={today}
                value={weightFields.date || today}
                onChange={(e) => setWeightFields((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addWeight.isPending}>
                {addWeight.isPending ? 'Guardando…' : t('exp.clinical.weight.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar UPP */}
      <Dialog open={uppDialogOpen} onOpenChange={setUppDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.upp.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = uppForm.validate(uppFields);
              if (!data) return;
              addUlcer.mutate({
                residentId,
                location: data.location,
                stage: data.stage as number,
                onsetDate: new Date(uppFields.onsetDate || today),
                acquired: uppFields.acquired as UPPOrigin,
                notes: data.notes || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="upp-loc">Localización anatómica</Label>
              <Input
                id="upp-loc"
                placeholder="sacro, talón derecho, trocánter…"
                aria-invalid={Boolean(uppForm.errors.location)}
                value={uppFields.location}
                onChange={(e) => setUppFields((s) => ({ ...s, location: e.target.value }))}
              />
              <FieldError>{uppForm.errors.location}</FieldError>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="upp-stage">Estadio (1–4)</Label>
                <Select
                  id="upp-stage"
                  value={uppFields.stage}
                  onChange={(e) => setUppFields((s) => ({ ...s, stage: e.target.value }))}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>Estadio {n}</option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="upp-acquired">Origen</Label>
                <Select
                  id="upp-acquired"
                  value={uppFields.acquired}
                  onChange={(e) => setUppFields((s) => ({ ...s, acquired: e.target.value }))}
                >
                  {Object.entries(UPP_ORIGIN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="upp-date">Fecha de inicio</Label>
              <Input
                id="upp-date"
                type="date"
                max={today}
                value={uppFields.onsetDate}
                onChange={(e) => setUppFields((s) => ({ ...s, onsetDate: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addUlcer.isPending}>
                {addUlcer.isPending ? 'Guardando…' : t('exp.clinical.upp.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar cura de UPP */}
      <Dialog open={curingDialogOpen} onOpenChange={setCuringDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.upp.curing.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = curingForm.validate(curingFields);
              if (!data) return;
              addCuring.mutate({
                pressureUlcerId: activeCuringUlcerId,
                residentId,
                date: new Date(curingFields.date || today),
                treatment: data.treatment,
                evolution: data.evolution || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="cur-treatment">Tratamiento / apósito</Label>
              <Input
                id="cur-treatment"
                placeholder="Apósito hidrocoloide 10x10cm…"
                aria-invalid={Boolean(curingForm.errors.treatment)}
                value={curingFields.treatment}
                onChange={(e) => setCuringFields((s) => ({ ...s, treatment: e.target.value }))}
              />
              <FieldError>{curingForm.errors.treatment}</FieldError>
            </div>
            <div>
              <Label htmlFor="cur-ev">Evolución (opcional)</Label>
              <Input
                id="cur-ev"
                placeholder="mejor / igual / peor / resuelto"
                value={curingFields.evolution}
                onChange={(e) => setCuringFields((s) => ({ ...s, evolution: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="cur-date">Fecha</Label>
              <Input
                id="cur-date"
                type="date"
                max={today}
                value={curingFields.date || today}
                onChange={(e) => setCuringFields((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addCuring.isPending}>
                {addCuring.isPending ? 'Guardando…' : t('exp.clinical.upp.curing.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar caída */}
      <Dialog open={fallDialogOpen} onOpenChange={setFallDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.clinical.falls.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = fallForm.validate(fallFields);
              if (!data) return;
              addFall.mutate({
                residentId,
                occurredAt: new Date(fallFields.occurredAt || today),
                location: data.location || undefined,
                circumstances: data.circumstances || undefined,
                injuries: data.injuries || undefined,
                measures: data.measures || undefined,
                witnessed: fallFields.witnessed,
              });
            }}
          >
            <div>
              <Label htmlFor="fall-date">Fecha y hora</Label>
              <Input
                id="fall-date"
                type="datetime-local"
                value={fallFields.occurredAt}
                onChange={(e) => setFallFields((s) => ({ ...s, occurredAt: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="fall-loc">Lugar (opcional)</Label>
              <Input
                id="fall-loc"
                placeholder="habitación, pasillo, baño…"
                value={fallFields.location}
                onChange={(e) => setFallFields((s) => ({ ...s, location: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="fall-inj">Lesiones (opcional)</Label>
              <Input
                id="fall-inj"
                placeholder="contusión, herida, fractura…"
                value={fallFields.injuries}
                onChange={(e) => setFallFields((s) => ({ ...s, injuries: e.target.value }))}
              />
            </div>
            <label className="flex min-h-[48px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={fallFields.witnessed}
                onChange={(e) => setFallFields((s) => ({ ...s, witnessed: e.target.checked }))}
              />
              Caída presenciada
            </label>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addFall.isPending}>
                {addFall.isPending ? 'Guardando…' : t('exp.clinical.falls.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Prescribir sujeción */}
      <Dialog open={restraintDialogOpen} onOpenChange={setRestraintDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.clinical.restraints.add')}</DialogTitle>
          <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('exp.clinical.restraints.legalNote')}
          </p>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = restraintForm.validate(restraintFields);
              if (!data) return;
              addRestraint.mutate({
                residentId,
                type: restraintType as RestraintType,
                justification: data.justification,
                prescribedAt: new Date(restraintFields.prescribedAt || today),
                consentObtained: restraintFields.consentObtained,
                consentDate: restraintFields.consentDate ? new Date(restraintFields.consentDate) : undefined,
                consentBy: data.consentBy || undefined,
                notes: data.notes || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="rs-type">Tipo de sujeción</Label>
              <Select id="rs-type" value={restraintType} onChange={(e) => setRestraintType(e.target.value)}>
                {Object.entries(RESTRAINT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rs-just">Justificación clínica (mínimo 10 caracteres)</Label>
              <Input
                id="rs-just"
                placeholder="Motivo clínico documentado…"
                aria-invalid={Boolean(restraintForm.errors.justification)}
                value={restraintFields.justification}
                onChange={(e) => setRestraintFields((s) => ({ ...s, justification: e.target.value }))}
              />
              <FieldError>{restraintForm.errors.justification}</FieldError>
            </div>
            <div>
              <Label htmlFor="rs-date">Fecha de prescripción</Label>
              <Input
                id="rs-date"
                type="date"
                value={restraintFields.prescribedAt || today}
                onChange={(e) => setRestraintFields((s) => ({ ...s, prescribedAt: e.target.value }))}
              />
            </div>
            <label className="flex min-h-[48px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={restraintFields.consentObtained}
                onChange={(e) => setRestraintFields((s) => ({ ...s, consentObtained: e.target.checked }))}
              />
              Consentimiento obtenido
            </label>
            {restraintFields.consentObtained && (
              <div>
                <Label htmlFor="rs-consentBy">Firmado por</Label>
                <Input
                  id="rs-consentBy"
                  placeholder="nombre del residente o representante"
                  value={restraintFields.consentBy}
                  onChange={(e) => setRestraintFields((s) => ({ ...s, consentBy: e.target.value }))}
                />
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addRestraint.isPending}>
                {addRestraint.isPending ? 'Guardando…' : t('exp.clinical.restraints.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revisión de sujeción */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.restraints.review')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = reviewForm.validate({ notes: reviewNotes });
              if (!data) return;
              reviewRestraint.mutate({ id: activeRestraintId, residentId, notes: data.notes });
            }}
          >
            <div>
              <Label htmlFor="rev-notes">Notas de la revisión</Label>
              <Input
                id="rev-notes"
                placeholder="Estado de la sujeción, observaciones…"
                aria-invalid={Boolean(reviewForm.errors.notes)}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
              <FieldError>{reviewForm.errors.notes}</FieldError>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={reviewRestraint.isPending}>
                {reviewRestraint.isPending ? 'Guardando…' : t('exp.clinical.restraints.review')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fin de sujeción */}
      <Dialog open={endRestraintDialogOpen} onOpenChange={setEndRestraintDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.restraints.end')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = endRestraintForm.validate(endReasonFields);
              if (!data) return;
              endRestraint.mutate({
                id: activeRestraintId,
                residentId,
                endDate: new Date(endReasonFields.endDate || today),
                endReason: data.endReason,
              });
            }}
          >
            <div>
              <Label htmlFor="end-reason">Motivo de finalización</Label>
              <Input
                id="end-reason"
                placeholder="Mejora del estado, retirada médica…"
                aria-invalid={Boolean(endRestraintForm.errors.endReason)}
                value={endReasonFields.endReason}
                onChange={(e) => setEndReasonFields((s) => ({ ...s, endReason: e.target.value }))}
              />
              <FieldError>{endRestraintForm.errors.endReason}</FieldError>
            </div>
            <div>
              <Label htmlFor="end-date">Fecha de finalización</Label>
              <Input
                id="end-date"
                type="date"
                value={endReasonFields.endDate || today}
                onChange={(e) => setEndReasonFields((s) => ({ ...s, endDate: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={endRestraint.isPending}>
                {endRestraint.isPending ? 'Guardando…' : t('exp.clinical.restraints.end')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Añadir consentimiento */}
      <Dialog open={consentDialogOpen} onOpenChange={setConsentDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.clinical.consents.add')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = consentForm.validate(consentFields);
              if (!data) return;
              addConsent.mutate({
                residentId,
                type: consentType as ConsentType,
                granted: consentGranted,
                grantedBy: data.grantedBy || undefined,
                date: new Date(consentFields.date || today),
                notes: data.notes || undefined,
              });
            }}
          >
            <div>
              <Label htmlFor="cs-type">Tipo de consentimiento</Label>
              <Select id="cs-type" value={consentType} onChange={(e) => setConsentType(e.target.value)}>
                {Object.entries(CONSENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div className="flex gap-6">
              <label className="flex min-h-[48px] items-center gap-2 text-sm">
                <input type="radio" name="granted" checked={consentGranted} onChange={() => setConsentGranted(true)} />
                Concedido
              </label>
              <label className="flex min-h-[48px] items-center gap-2 text-sm">
                <input type="radio" name="granted" checked={!consentGranted} onChange={() => setConsentGranted(false)} />
                Revocado
              </label>
            </div>
            <div>
              <Label htmlFor="cs-by">Firmado por (opcional)</Label>
              <Input
                id="cs-by"
                placeholder="Nombre del residente o representante"
                value={consentFields.grantedBy}
                onChange={(e) => setConsentFields((s) => ({ ...s, grantedBy: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="cs-date">Fecha</Label>
              <Input
                id="cs-date"
                type="date"
                value={consentFields.date || today}
                onChange={(e) => setConsentFields((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={addConsent.isPending}>
                {addConsent.isPending ? 'Guardando…' : t('exp.clinical.consents.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
