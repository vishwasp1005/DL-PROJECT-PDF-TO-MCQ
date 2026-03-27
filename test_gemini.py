from google import genai

client = genai.Client(
    api_key="AIzaSyC8hC8yL_a4szNkRGFXXLO8UrpJUxmTvhU",
    http_options={"api_version": "v1"}
)

response = client.models.generate_content(
    model="gemini-2.5-flash",   
    contents="Say hello"
)

print(response.text)