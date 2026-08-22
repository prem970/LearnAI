/**
 * D-ID talks use Microsoft Neural TTS (`script.provider.type: microsoft`).
 * @see https://docs.d-id.com/reference/microsoft-azure-voices
 */
export const DID_MS_NEURAL_VOICE = {
  male: 'en-US-AndrewMultilingualNeural',
  female: 'en-US-AvaMultilingualNeural',
}

/** @param {'male' | 'female'} gender */
export function didMicrosoftVoiceIdForGender(gender) {
  return gender === 'male' ? DID_MS_NEURAL_VOICE.male : DID_MS_NEURAL_VOICE.female
}
