'use client';

import { Switch } from '@/components/ui/choice';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import type { FieldDef, FieldGroup, Settings, SettingValue } from '@/domain/page-designs/types';

/**
 * One layout's settings, as a form built from its definition.
 *
 * A field whose value differs from the layout's own default carries a small
 * marker, so "what did we change on this page?" is answerable at a glance --
 * and a single click on it puts that one field back.
 */
export function DesignFields({
  groups,
  settings,
  defaults,
  variant,
  onChange,
}: {
  groups: FieldGroup[];
  /** The layout being edited: settings that belong to other layouts are left out. */
  variant?: string;
  settings: Settings;
  defaults: Settings;
  onChange: (key: string, value: SettingValue) => void;
}) {
  return (
    <div className="grid gap-x-8 gap-y-7 p-4 sm:p-5 2xl:grid-cols-2">
      {groups.map((group) => {
        const fields = group.fields.filter((field) => !variant || !field.onlyFor || field.onlyFor.includes(variant));
        return fields.length === 0 ? null : (
        <fieldset key={group.title} className="min-w-0">
          <legend className="text-faint mb-1 text-2xs font-semibold uppercase tracking-wider">{group.title}</legend>
          <div className="divide-line divide-y">
            {fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={settings[field.key]}
                changed={settings[field.key] !== defaults[field.key]}
                onChange={(value) => onChange(field.key, value)}
                onRestore={() => onChange(field.key, defaults[field.key])}
              />
            ))}
          </div>
        </fieldset>
        );
      })}
    </div>
  );
}

function Changed({ onRestore }: { onRestore: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        onRestore();
      }}
      className="text-accent-ink hover:bg-accent/10 pointer-events-auto relative z-10 ml-1.5 inline-flex items-center gap-1 rounded px-1 align-middle text-2xs font-medium"
      title="Changed from this layout’s default. Click to restore it."
    >
      <span aria-hidden className="bg-accent size-1.5 rounded-full" />
      Changed
    </button>
  );
}

function Field({
  field,
  value,
  changed,
  onChange,
  onRestore,
}: {
  field: FieldDef;
  value: SettingValue;
  changed: boolean;
  onChange: (value: SettingValue) => void;
  onRestore: () => void;
}) {
  if (field.kind === 'toggle') {
    return (
      <Switch
        label={
          <>
            {field.label}
            {changed ? <Changed onRestore={onRestore} /> : null}
          </>
        }
        description={field.description}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  const heading = (
    <p className="text-ink text-sm font-medium">
      {field.label}
      {changed ? <Changed onRestore={onRestore} /> : null}
    </p>
  );

  if (field.kind === 'choice') {
    return (
      <div className="py-2.5">
        {heading}
        <div className="mt-1.5">
          {field.options.length <= 4 ? (
            <Segmented
              label={field.label}
              value={String(value)}
              onChange={(next) => onChange(next)}
              options={field.options}
              size="sm"
            />
          ) : (
            <Select label={field.label} hideLabel value={String(value)} onChange={(event) => onChange(event.target.value)}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </div>
        {field.description ? <p className="text-muted mt-1 text-xs">{field.description}</p> : null}
      </div>
    );
  }

  return (
    <div className="py-2.5">
      {heading}
      <div className="mt-1.5">
        <Input
          label={field.label}
          hideLabel
          value={String(value)}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {field.description ? <p className="text-muted mt-1 text-xs">{field.description}</p> : null}
    </div>
  );
}
