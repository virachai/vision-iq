import { Test, type TestingModule } from "@nestjs/testing";
import { AlignmentController } from "./alignment.controller";
import { AlignmentService } from "./alignment.service";

describe("AlignmentController", () => {
	let controller: AlignmentController;
	let service: AlignmentService;

	const mockAlignmentService = {
		extractVisualIntent: jest.fn(),
		findAlignedImages: jest.fn(),
		syncPexelsLibrary: jest.fn(),
		getStats: jest.fn(),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [AlignmentController],
			providers: [
				{
					provide: AlignmentService,
					useValue: mockAlignmentService,
				},
			],
		}).compile();

		controller = module.get<AlignmentController>(AlignmentController);
		service = module.get<AlignmentService>(AlignmentService);
		jest.clearAllMocks();
	});

	it("should be defined", () => {
		expect(controller).toBeDefined();
	});

	describe("extractVisualIntent", () => {
		it("should delegate to service.extractVisualIntent", async () => {
			const dto = { raw_gemini_text: "test text" };
			const expectedResult = [{ intent: "scene 1" }];
			mockAlignmentService.extractVisualIntent.mockResolvedValue(
				expectedResult,
			);

			const result = await controller.extractVisualIntent(dto);
			expect(result).toBe(expectedResult);
			expect(service.extractVisualIntent).toHaveBeenCalledWith(dto);
		});
	});

	describe("findAlignedImages", () => {
		it("should delegate to service.findAlignedImages", async () => {
			const dto = { scenes: [] };
			const expectedResult = [[{ image_id: "1" }]];
			mockAlignmentService.findAlignedImages.mockResolvedValue(expectedResult);

			const result = await controller.findAlignedImages(dto);
			expect(result).toBe(expectedResult);
			expect(service.findAlignedImages).toHaveBeenCalledWith(dto);
		});
	});

	describe("syncPexels", () => {
		it("should delegate to service.syncPexelsLibrary with default values", async () => {
			await controller.syncPexels({});
			expect(service.syncPexelsLibrary).toHaveBeenCalledWith("nature", 50);
		});

		it("should delegate to service.syncPexelsLibrary with provided values", async () => {
			await controller.syncPexels({ search_query: "cats", batch_size: 10 });
			expect(service.syncPexelsLibrary).toHaveBeenCalledWith("cats", 10);
		});
	});

	describe("getStats", () => {
		it("should delegate to service.getStats", async () => {
			const stats = { totalImages: 100 };
			mockAlignmentService.getStats.mockResolvedValue(stats);

			const result = await controller.getStats();
			expect(result).toBe(stats);
			expect(service.getStats).toHaveBeenCalled();
		});
	});
});
