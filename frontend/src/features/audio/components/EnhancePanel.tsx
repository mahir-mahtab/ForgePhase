import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { SpectrumCompare } from '@/components/shared/SpectrumCompare'
import { SwitchField } from '@/components/shared/SwitchField'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { AUDIO_DEFAULTS, enhanceAudio } from '@/services/audioService'

export function EnhancePanel() {
  const [file, setFile] = useState<File | null>(null)
  const [reductionDb, setReductionDb] = useState<number>(AUDIO_DEFAULTS.enhanceReductionDb)
  const [harmonics, setHarmonics] = useState<number>(AUDIO_DEFAULTS.harmonics)
  const [clarityDb, setClarityDb] = useState<number>(AUDIO_DEFAULTS.clarityDb)
  const [normalize, setNormalize] = useState<boolean>(AUDIO_DEFAULTS.normalize)
  // The file the shown result came from, so picking a new one does not skew the comparison.
  const [source, setSource] = useState<File | null>(null)
  const { state, execute, reset } = useOperation(enhanceAudio)

  const isRunning = state.phase === 'running'

  const handleRun = useCallback(() => {
    if (!file) return
    setSource(file)
    void execute({ input: file, reductionDb, harmonics, clarityDb, normalize })
  }, [clarityDb, execute, file, harmonics, normalize, reductionDb])

  return (
    <OperationShell
      title="Enhance speech"
      description="Two-step noise reduction (TSNR) removes the one-frame lag that blurs onsets, then harmonic regeneration rebuilds pitch harmonics the suppression erased. A lift of the 300–3400 Hz band adds clarity, and levelling brings the voice to a steady loudness."
      runLabel="Enhance"
      canRun={file !== null}
      blockedReason="Choose an audio file."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'enhance', file?.name ?? 'speech.wav', 'enhanced.wav',
        '--reduction-db', reductionDb, '--harmonics', harmonics, '--clarity-db', clarityDb,
        !normalize && '--no-normalize',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The enhanced audio appears here, with spectrograms and the average spectrum before and after."
          note={
            state.phase === 'ok' && source ? (
              <SpectrumCompare
                input={source}
                output={state.data.artifact.file}
                outputLabel="Enhanced"
              />
            ) : null
          }
        />
      }
    >
      <FileDropzone
        label="Speech recording"
        kind="audio"
        accept={ACCEPT_AUDIO}
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
        sample={SAMPLES.enhance}
      />
      <ParamSlider
        label="Noise reduction"
        description="The most a noise-only bin is turned down. 0 skips noise reduction and only equalizes and levels."
        value={reductionDb}
        min={0}
        max={30}
        step={1}
        unit="dB"
        disabled={isRunning}
        onChange={setReductionDb}
      />
      <ParamSlider
        label="Harmonic regeneration"
        description="How much the rebuilt harmonic comb steers the gain. 0 is plain two-step reduction; higher keeps voiced sounds fuller."
        value={harmonics}
        min={0}
        max={1}
        step={0.05}
        disabled={isRunning}
        onChange={setHarmonics}
      />
      <ParamSlider
        label="Clarity"
        description="Lift of the speech band. Above about 8 dB voices start to sound thin."
        value={clarityDb}
        min={0}
        max={12}
        step={0.5}
        unit="dB"
        disabled={isRunning}
        onChange={setClarityDb}
      />
      <SwitchField
        label="Level loudness"
        description="Bring active speech to −20 dBFS, backing off if that would clip."
        checked={normalize}
        onCheckedChange={setNormalize}
        disabled={isRunning}
      />
    </OperationShell>
  )
}
