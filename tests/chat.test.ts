import { ChatPage } from './pages/chat';
import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await page.goto('/');
    await chatPage.createNewChat();
  });

  test('send user message and get response', async () => {
    await chatPage.sendUserMessage('Hello, how are you?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toBeTruthy();
  });

  test('show and hide reasoning', async () => {
    await chatPage.sendUserMessage(
      "Let's explore creative options. What are 5 unusual ice cream flavors?",
    );
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();

    // Toggle reasoning on
    await assistantMessage.toggleReasoningVisibility();
    expect(await assistantMessage.reasoning).not.toBeNull();

    // Toggle reasoning off
    await assistantMessage.toggleReasoningVisibility();
    expect(await assistantMessage.reasoning).toBeNull();
  });

  test('edit user message', async () => {
    const userMessage = 'This is my initial message';
    await chatPage.sendUserMessage(userMessage);
    await chatPage.isGenerationComplete();

    const editedMessage = 'This is my edited message';
    const userMessageObj = await chatPage.getRecentUserMessage();
    await userMessageObj.edit(editedMessage);
    await chatPage.isGenerationComplete();

    const updatedUserMessage = await chatPage.getRecentUserMessage();
    expect(updatedUserMessage.content).toBe(editedMessage);
  });

  test('choose and use chat model', async () => {
    const modelOption = 'chat-model-default';
    await chatPage.chooseModelFromSelector(modelOption);

    const selectedModel = await chatPage.getSelectedModel();
    expect(selectedModel).toBe(modelOption);

    await chatPage.sendUserMessage('What is the temperature in San Francisco?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toBe(
      'The current temperature in San Francisco is 17°C.',
    );
  });
});
