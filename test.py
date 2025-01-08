# from cartesia import Cartesia
# import os
#
# client = Cartesia(api_key="sk_car_AesK1B3HnrC5pI0FerfP8")
#
# # Get all available voices
# voices = client.voices.list()
# # print(voices)
# for voice in voices:
#     del voice["embedding"]
#     del voice["created_at"]
#     del voice["description"]
#
# for voice in voices:
#     print(voice, "\n")
# Get a specific voice
# voice = client.voices.get(id="a0e99841-438c-4a64-b679-ae501e7d6091")
# print("The embedding for", voice["name"], "is", voice["embedding"])

# import base64
#
#
# def base64_to_wav(input_file, output_file):
#     """
#     Convert a Base64-encoded audio string to a WAV audio file.
#
#     Args:
#         input_file (str): Path to the file containing the Base64-encoded audio string.
#         output_file (str): Path where the decoded WAV audio file will be saved.
#     """
#     try:
#         # Read the Base64-encoded audio string from the input file
#         with open(input_file, 'r') as file:
#             base64_audio = file.read()
#
#         # Decode the Base64 string
#         audio_data = base64.b64decode(base64_audio)
#
#         # Write the decoded audio data to the output WAV file
#         with open(output_file, 'wb') as wav_file:
#             wav_file.write(audio_data)
#
#         print(f"Decoded WAV file saved to: {output_file}")
#     except Exception as e:
#         print(f"Error: {e}")
#
#
# # Example Usage
# input_base64_file = 'audio_dump.txt'  # File containing the Base64-encoded string
# output_wav_file = 'decoded_audio.wav'  # Output WAV file
#
# base64_to_wav(input_base64_file, output_wav_file)

print(1//2)