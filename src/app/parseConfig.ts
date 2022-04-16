import { fs as fsExtra } from 'zx';
import { doesPathExist, genericErrorHandler } from './helpers';
import { addException, isEmpty, rawTypeOf, valueIs } from '../utils';
import { AnyObject, ConfigEntry, ConfigSchema } from '../compiler/types';
import {
  ArrayValidator,
  StringValidator,
  ObjectValidator,
  InterfaceToValidatorSchema,
} from '../lib/schema-validator/index';

type RawConfigSchema = { [toolName: string]: Partial<ConfigEntry> };

export const CONFIG_ENTRY_SCHEMA: InterfaceToValidatorSchema<ConfigEntry> = {
  depNames: ArrayValidator(StringValidator(), { allowEmpty: true }),
  devDepNames: ArrayValidator(StringValidator(), { allowEmpty: true }),
  localConfigurationPaths: ArrayValidator(StringValidator(), { allowEmpty: true }),
  remoteConfigurationUrls: ArrayValidator(StringValidator(), { allowEmpty: true }),
};

export default async function parseScaffyConfig(path: string): Promise<ConfigSchema> {
  try {
    await wasCommandInvokedInRootOfJSProjectDir();

    const rawConfig = (await fsExtra.readJSON(path)) as unknown;
    validateRawConfig(rawConfig);
    const validConfigObj = normalizeRawConfigEntries(rawConfig);
    return validConfigObj;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Looks like your are missing a `scaffy.json` file in the root directory of your project';

    return genericErrorHandler(message);
  }
}

async function wasCommandInvokedInRootOfJSProjectDir() {
  const requiredEntities = ['package.json', 'package-lock.json', 'node_modules'] as const;

  const doesPathExistWithExceptionOnFalsy = addException(doesPathExist);

  try {
    await doesPathExistWithExceptionOnFalsy(requiredEntities[0]);
  } catch (err) {
    throw new Error('Please run in the root directory of your project');
  }
}

function validateRawConfig(rawConfig: unknown): asserts rawConfig is RawConfigSchema {
  const parsedConfigIsNotAnObject = !valueIs.anObject(rawConfig);
  if (parsedConfigIsNotAnObject) throw new TypeError('Your config must be an object');

  const parsedConfigObjIsEmpty = isEmpty.obj(rawConfig);
  if (parsedConfigObjIsEmpty) throw new Error('Your config is empty');

  const containsNonStringKeys = !Object.keys(rawConfig).every(valueIs.aString);
  if (containsNonStringKeys)
    throw new TypeError('All keys in your config must be strings');
}

function normalizeRawConfigEntries(rawConfig: RawConfigSchema): ConfigSchema {
  const rawConfigEntries = Object.entries(rawConfig);
  const rawConfigEntriesWithoutEmptyEntries = rawConfigEntries.filter(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ([_, entry]) => rawTypeOf(entry) === 'object' && !isEmpty.obj(entry)
  );

  const validConfigEntries = rawConfigEntriesWithoutEmptyEntries
    .map(([toolName, toolConfig]) => {
      const normalizedConfigEntry = normalizeConfigEntry(toolConfig, toolName);
      if (!normalizedConfigEntry) return null;

      const validConfigEntry =
        fillInMissingEntryMembersIfNecessary(normalizedConfigEntry);
      return [toolName, validConfigEntry];
    })
    .filter(Boolean) as [string, ConfigEntry][];

  const validConfigObj = Object.fromEntries(validConfigEntries);
  return validConfigObj;
}

function normalizeConfigEntry(
  val: Partial<ConfigEntry> | AnyObject,
  toolName: string
): Partial<ConfigEntry> | null {
  const { isValid, value } = ObjectValidator<ConfigEntry>(CONFIG_ENTRY_SCHEMA, {
    filterViolations: true,
    allowEmpty: false,
  })({
    value: val as any,
    path: [`Config entry for ${toolName}`],
  });

  if (!isValid || isEmpty.obj(value)) return null;
  return value;
}

function fillInMissingEntryMembersIfNecessary(
  normalizedConfigEntry: Partial<ConfigEntry>
): ConfigEntry {
  const DEFAULT_CONFIG_ENTRY: ConfigEntry = {
    depNames: [],
    devDepNames: [],
    localConfigurationPaths: [],
    remoteConfigurationUrls: [],
  };

  return { ...DEFAULT_CONFIG_ENTRY, ...normalizedConfigEntry };
}
