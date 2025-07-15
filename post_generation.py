import os
import re

from markdown_it import MarkdownIt
from mdit_py_plugins.front_matter import front_matter_plugin
from PIL import Image
from datetime import datetime

class Post:
	def __init__(self, filename: str, directory: str):
		self.filename = filename
		self.dir = directory
		self.path = os.path.join(directory, filename)
		self.id = generate_markdown_id(self.path)
		self.creation_time = 0
		self.title = ""
		self.tags: list[str] = []
		self.preview = ""
		self._try_parse_metadata()

	def is_valid(self) -> bool:
		return self.title != "" and self.creation_time > 0 and self.id != "-1" and len(self.tags) > 0

	def _try_parse_metadata(self):
		if os.path.exists(self.path):
			try:
				self.creation_time = int(os.path.getctime(self.path))

				with open(self.path, 'r', encoding='utf-8') as file:
					md_content = file.read()
					lines = md_content.splitlines()
					if lines and lines[0].startswith('---'):
						end_index = lines.index('---', 1)
						if end_index > 0:
							for line in lines[1:end_index]:
								if ':' in line:
									key, value = line.split(':', 1)
									key = key.strip().lower()
									value = value.strip()

									if key == "title":
										self.title = value
									elif key == "tags":
										self.tags = [tag.strip() for tag in value.split(',')]
									elif key == "preview":
										self.preview = value.strip()
			except Exception as e:
				print(f"Error reading metadata from {self.path}: {e}")

class Photo:
	def __init__(self, filename: str, directory: str):
		self.filename = filename
		self.dir = directory
		self.path = os.path.join(directory, filename)
		self.width = 0
		self.height = 0
		self._try_parse_metadata()

	def _try_parse_metadata(self):
		if os.path.exists(self.path):
			try:
				self.width, self.height = Image.open(self.path).size
			except Exception as e:
				print(f"Error opening image {self.path}: {e}")
				self.width, self.height = 0, 0
	
	def copy(self, target_photo: 'Photo') -> 'Photo':
		if not os.path.exists(target_photo.dir):
			os.makedirs(target_photo.dir)
		try:
			with open(self.path, 'rb') as src_file:
				with open(target_photo.path, 'wb') as dst_file:
					dst_file.write(src_file.read())
			target_photo.width = self.width
			target_photo.height = self.height
		except Exception as e:
			print(f"Error copying image {self.path} to {target_photo.path}: {e}")
		return target_photo
	
	def resize(self, max_size: int, target_photo: 'Photo') -> 'Photo':
		if self.width > max_size or self.height > max_size:
			ratio = min(max_size / self.width, max_size / self.height)
			new_width = int(self.width * ratio)
			new_height = int(self.height * ratio)
			try:
				with Image.open(self.path) as img:
					resized_img = img.resize((new_width, new_height), Image.LANCZOS)
					resized_img.save(target_photo.path)
					target_photo.width, target_photo.height = resized_img.size
			except Exception as e:
				print(f"Error resizing image {self.path}: {e}")
		else:
			self.copy(target_photo)

		return target_photo

class Config:
	def __init__(self, markdown_dir: str, md_media_dir: str, html_dir: str, html_media_dir: str, image_size_max: int, image_size_percentage: float, data_dir: str):
		self.markdown_dir = markdown_dir
		self.md_media_dir = md_media_dir
		self.html_dir = html_dir
		self.html_media_dir = html_media_dir
		self.image_size_max = image_size_max
		self.image_size_percentage = image_size_percentage
		self.post_metadata_path = os.path.join(data_dir, "posts.json")
		self.tag_metadata_path = os.path.join(data_dir, "tags.json")

def generate_html_for_markdown_folder(config: Config) -> None:
	for file in os.listdir(config.markdown_dir):
		if file.endswith(".md"):
			md_path = os.path.join(config.markdown_dir, file)
			generate_html_for_markdown_file(md_path, config)

def generate_html_for_markdown_file(md_path: str, config: Config) -> None:
	with open(md_path, "r", encoding="utf-8") as md_file:
		md_content = md_file.read()
		(md_content, markdown_media_data) = preprocess_markdown_content(md_content)
		html_media_data = process_media_files(markdown_media_data, config)
		md = init_markdown_parser(config, html_media_data)
		html_content = md.render(md_content)
		html_content = postprocess_html_content(html_content)
		svelte_content = decorate_generated_html_with_css(html_content)
		svelte_dir = get_svelte_directory(md_path, config.html_dir)
		write_svelte_content_to_file(svelte_content, svelte_dir)

def preprocess_markdown_content(markdown_text: str) -> tuple[str, dict[str, str]]:
	converted_files = {}
	
	# Converts Obsidian-style image embeds ![[image file name.png]] to CommonMark format ![](image_file_name.png)
	def replacer(match):
		filename = match.group(1)
		sanitized = filename.replace(' ', '_')
		converted_files[filename] = sanitized
		return f"![Image]({sanitized})"

	pattern = re.compile(r'!\[\[([^\[\]]+?)\]\]')
	converted_text = pattern.sub(replacer, markdown_text)
	return (converted_text, converted_files)

def process_media_files(markdown_media_data: dict[str, str], config: Config) -> dict[str, Photo]:
	html_media_data = {}
	for original, sanitized in markdown_media_data.items():
		original_path = os.path.join(config.md_media_dir, original)
		sanitized_path = os.path.join(config.html_media_dir, sanitized)
		if not os.path.exists(sanitized_path):
			if os.path.exists(original_path):
				photo = Photo(original, config.md_media_dir)
				target_photo = Photo(sanitized, config.html_media_dir)
				photo.resize(config.image_size_max, target_photo)
		else:
			target_photo = Photo(sanitized, config.html_media_dir)
		
		html_media_data[sanitized] = target_photo
	
	return html_media_data

def init_markdown_parser(config: Config, html_media_data: dict[str, Photo]) -> MarkdownIt:
	md = MarkdownIt('gfm-like', {'breaks': True, 'html': True, 'linkify': True})
	static_img_dir = config.html_media_dir.replace('static', '')

	def render_html_media_dir(self, tokens, idx, options, env):
		token = tokens[idx]
		src = token.attrs["src"]

		if not src.startswith("http://") and not src.startswith("https://") and src in html_media_data:
			static_src = f"{static_img_dir}/{src}"
			alt = token.attrs.get("alt", "")
			width = html_media_data[src].width
			height = html_media_data[src].height
			if height > width:
				percent_width = int(config.image_size_percentage * 100 * width / height)
			else:
				percent_width = int(config.image_size_percentage * 100)
			style=f"max-width: {percent_width}%; height: auto; margin-left: auto; margin-right: auto;"
			return f'<img class="image-box" loading="lazy" src="{static_src}" alt="{alt}" width="{width}" height="{height}" style="{style}"/>'
		return self.image(tokens, idx, options, env)

	md.add_render_rule("image", render_html_media_dir)
	md.use(front_matter_plugin)
	return md

def postprocess_html_content(html_content: str) -> str:
	# Remove empty <p> tags that only contain an <img .../> tag
	html_content = re.sub(
		r'<p>\s*(<img\b[^>]*\/?>)\s*<\/p>',
		r'\1',
		html_content,
		flags=re.DOTALL
	)
	return html_content

def decorate_generated_html_with_css(html_content: str) -> str:
	svelte_content = f"""
		<section class="post-content" style="display: flex; flex-direction: column;">
		{html_content.replace('`', '\\`')}
		</section>
	"""
	css_content = """
		<style>
		.post-content {
			display: flex;
			flex-direction: column;
		}

		h2 {
			color: #000;
			font-weight: bold;
			font-size: 1.25rem;
			line-height: 2rem;
		}

		.post-content ul,
		.post-content ol {
			margin-block-start: 0;
			margin-block-end: 0;
		}

		.post-content p,
		.post-content ul,
		.post-content ol {
			color: #323334;
			text-align: justify;
			font-size: 1rem;
			line-height: 2rem;
		}

		.post-content h2,
		.post-content p,
		.post-content > ul > li:first-child,
		.post-content > ol > li:first-child,
		.post-content .image-box {
			margin-block-start: 1.5rem;
			margin-block-end: 0;
		}

		</style>
	"""

	return svelte_content + css_content

def get_svelte_directory(md_path: str, html_dir: str) -> str:
	folder_name = generate_markdown_id(md_path)
	svelte_dir = os.path.join(html_dir, folder_name)
	return svelte_dir

def generate_markdown_id(md_path: str) -> str:
	try:
		stat = os.stat(md_path)
		return datetime.fromtimestamp(stat.st_birthtime).strftime("%Y%m%d%H%M%S")
	except Exception as e:
		print(f"Error generating ID for {md_path}: {e}")
		return "-1"

def write_svelte_content_to_file(svelte_content: str, svelte_dir: str) -> None:
	os.makedirs(svelte_dir, exist_ok=True)
	svelte_path = os.path.join(svelte_dir, "+page.svelte")
	with open(svelte_path, "w", encoding="utf-8") as svelte_file:
		svelte_file.write(svelte_content)

def generate_metadata_for_markdown_folder(config: Config) -> None:
	post_metadata = get_post_metadata(config.markdown_dir)
	write_post_metadata(post_metadata, config.post_metadata_path)
	tag_metadata = parse_tag_metadata(post_metadata)
	write_tag_metadata(tag_metadata, config)

def get_post_metadata(md_dir: str) -> list[Post]:
	metadata = []
	for filename in os.listdir(md_dir):
		if filename.endswith('.md'):
			post = Post(filename, md_dir)
			if post.is_valid():
				metadata.append(post)
	metadata.sort(key=lambda x: x.creation_time, reverse=True)
	return metadata

def write_post_metadata(post_metadata: list[Post], post_metadata_path: str) -> None:
	json_data = [{
		"id": post.id,
		"title": post.title,
		"creation_time": post.creation_time,
		"tags": post.tags,
		"preview": post.preview,
	} for post in post_metadata if post.is_valid()]

	os.makedirs(os.path.dirname(post_metadata_path), exist_ok=True)
	with open(post_metadata_path, 'w', encoding='utf-8') as file:
		import json
		json.dump(json_data, file, indent=4, ensure_ascii=False)

def parse_tag_metadata(post_metadata: list[Post]) -> list[dict[str, int]]:
	tag_dict = {}
	for post in post_metadata:
		for tag in post.tags:
			if tag not in tag_dict:
				tag_dict[tag] = 0
			tag_dict[tag] += 1
	tag_metadata = [{"tag": tag, "count": count} for tag, count in tag_dict.items()]
	tag_metadata.sort(key=lambda x: (-x["count"], x["tag"].lower()))
	tag_metadata.insert(0, {"tag": "all", "count": len(post_metadata)})
	return tag_metadata

def write_tag_metadata(tag_metadata: list[dict[str, int]], config: Config) -> None:
	os.makedirs(os.path.dirname(config.tag_metadata_path), exist_ok=True)
	with open(config.tag_metadata_path, 'w', encoding='utf-8') as file:
		import json
		json.dump(tag_metadata, file, indent=4, ensure_ascii=False)

if __name__ == "__main__":
	config = Config(
		markdown_dir="drafts",
		md_media_dir="drafts/media",
		html_dir="src/routes/posts",
		html_media_dir="static/media",
		image_size_max=1024,
		image_size_percentage=0.8,
		data_dir="src/lib"
	) 
	generate_html_for_markdown_folder(config)
	generate_metadata_for_markdown_folder(config)