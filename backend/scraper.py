from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

url = input("enter job url: ")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(url)
    page.wait_for_load_state("networkidle")  # Wait for JS to finish
    html = page.content()  # Get fully rendered HTML
    browser.close()

soup = BeautifulSoup(html, "html.parser")
print(soup.prettify())
