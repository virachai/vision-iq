import { beforeAll, afterAll, describe, it, expect, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "./../src/app.module";
import { PrismaClient } from "@repo/database";
import { QueueService } from "./../src/queue/queue.service";

describe("LinksController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaClient)
      .useValue({})
      .overrideProvider(QueueService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it("GET /links (findAll)", () => {
    return request(app.getHttpServer())
      .get("/links")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty("title");
      });
  });

  it("POST /links (create)", () => {
    const createLinkDto = {
      title: "Test Link",
      url: "https://example.com",
      description: "Test Description",
    };
    return request(app.getHttpServer())
      .post("/links")
      .send(createLinkDto)
      .expect(201)
      .expect((res) => {
        expect(res.text).toContain(
          "TODO: This action should add a new link 'Test Link'",
        );
      });
  });

  it("GET /links/:id (findOne)", () => {
    return request(app.getHttpServer())
      .get("/links/1")
      .expect(200)
      .expect((res) => {
        expect(res.text).toContain(
          "TODO: This action should return a Link with id #1",
        );
      });
  });

  it("PATCH /links/:id (update)", () => {
    const updateLinkDto = {
      title: "Updated Link",
    };
    return request(app.getHttpServer())
      .patch("/links/1")
      .send(updateLinkDto)
      .expect(200)
      .expect((res) => {
        expect(res.text).toContain(
          "TODO: This action should update a #1 link Updated Link",
        );
      });
  });

  it("DELETE /links/:id (remove)", () => {
    return request(app.getHttpServer())
      .delete("/links/1")
      .expect(200)
      .expect((res) => {
        expect(res.text).toContain("TODO: This action should remove a #1 link");
      });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
