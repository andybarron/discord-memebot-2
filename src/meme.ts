import assert from "node:assert/strict";
import { z } from "zod";
import qs from "qs";

// https://api.imgflip.com/get_memes
const MemeTemplate = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    width: z.number(),
    height: z.number(),
    box_count: z.number(),
  })
  .transform(({ box_count, ...value }) => ({
    ...value,
    boxCount: box_count,
  }));
type MemeTemplate = z.infer<typeof MemeTemplate>;

const GetMemesResponse = z.object({
  success: z.literal(true),
  data: z.object({
    memes: z.array(MemeTemplate),
  }),
});

const CreateMemeResponse = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.string(),
  }),
});

export class MemeClient {
  username: string;
  password: string;
  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }
  async getTopMemeTemplates(): Promise<MemeTemplate[]> {
    const response = await fetch("https://api.imgflip.com/get_memes");
    const json = await response.json();
    const result = GetMemesResponse.parse(json);
    return result.data.memes;
  }
  async getTemplateById(templateId: string): Promise<MemeTemplate | undefined> {
    const templates = await this.getTopMemeTemplates();
    return templates.find((t) => t.id === templateId);
  }
  async createMeme(
    templateId: string,
    captions: string[]
  ): Promise<{ url: string }> {
    assert(captions.length > 0);
    const params = {
      template_id: templateId,
      boxes: captions.map((text) => ({ text })),
      username: this.username,
      password: this.password,
    };
    const body = qs.stringify(params);
    const response = await fetch("https://api.imgflip.com/caption_image", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const json = await response.json();
    console.log({ json });
    const result = CreateMemeResponse.parse(json);
    const { url } = result.data;
    return { url };
  }
}
