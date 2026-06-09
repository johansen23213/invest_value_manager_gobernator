/**
 * @vetlla/ai — Fundación provider-agnóstica del copiloto (ADR-0010, Slice 1).
 *
 * Toda la capa de IA del producto se apoya en la interfaz `ModelProvider`. La elección
 * de motor es reversible y configurable por entorno; en local/tests se usa el
 * `StubProvider` determinista (sin red, sin GPU, sin clave).
 */

// Interfaz y bucle de tool-use (el corazón).
export type {
  MessageRole,
  Message,
  ToolDefinition,
  ToolCall,
  ResponseFormat,
  CompletionOptions,
  CompletionInput,
  Usage,
  StopReason,
  CompletionResult,
  ModelTier,
  ModelProvider,
  ToolResult,
  ToolExecutor,
  ToolUseLoopOptions,
  ToolUseLoopResult,
} from './provider';
export { runToolUseLoop } from './provider';

// Registro de modelos por proveedor, resuelto por entorno.
export {
  PROVIDERS,
  MODEL_TIERS,
  DEFAULT_PROVIDER,
  isProviderId,
  resolveProvider,
  resolveModel,
  resolveModelMap,
} from './models';
export type { ProviderId, ModelEnv } from './models';

// Proveedores (stub funcional; vllm/bedrock/vertex esqueletos) + fábrica por entorno.
export {
  createProvider,
  StubProvider,
  VllmProvider,
  BedrockProvider,
  VertexProvider,
  NotImplementedError,
} from './providers';
export type { StubProviderOptions } from './providers/stub';

// Privacidad: minimización + seudonimización de PII.
export { redactPii, rehydrate } from './privacy';
export type { PiiCategory, PiiMapEntry, RedactionResult, KnownIdentifiers } from './privacy';

// Definiciones de herramientas tipadas (Zod).
export {
  careRecordTypeSchema,
  getResidentInput,
  listCareRecordsInput,
  proposeCareRecordInput,
  proposeCarePlanInput,
  COPILOT_TOOLS,
  toToolDefinition,
  copilotToolDefinitions,
  parseToolInput,
} from './tools';
export type {
  GetResidentInput,
  ListCareRecordsInput,
  ProposeCareRecordInput,
  ProposeCarePlanInput,
  CopilotTool,
  CopilotToolName,
} from './tools';

// Plantillas de prompt versionadas (es/ca).
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  PROMPT_TEMPLATES,
  careRecordExtractionV1,
  carePlanDraftV1,
  resolveLocale,
  getSystemPrompt,
} from './prompts';
export type { Locale, PromptTemplate } from './prompts';
