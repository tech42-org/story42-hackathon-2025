// Michael API Service - Story Generation API Integration
// Base URL for Michael's API
const MICHAEL_API_BASE = 'https://a3aflxx1o2.execute-api.us-east-1.amazonaws.com/dev';

/**
 * Generate story outline using Michael's API
 * @param {Object} params - Story parameters
 * @param {string} idToken - Cognito ID token
 * @returns {Promise<Object>} Story outline with speaker names and story parts
 */
export const generateStoryOutline = async (params, idToken) => {
  const {
    topic,
    genre,
    tone,
    length,
    storyType = 'visual',
    numberOfSpeakers = 2,
    panels = 6,
    audioLength = 5,
    jobId
  } = params;

  // Map reading level from length (short/medium/long -> elementary/middle school/high school)
  const lengthToReadingLevel = {
    'short': 'elementary',
    'medium': 'middle school',
    'long': 'high school'
  };
  const readingLevel = lengthToReadingLevel[length] || 'middle school';

  const requestBody = {
    genre: genre || 'fiction',
    reading_level: readingLevel,
    tone: tone || 'engaging',
    user_input_description: topic,
    story_type: storyType,
    number_of_speakers: numberOfSpeakers,
    job_id: jobId,
    model_id: 'bedrock/openai.gpt-oss-120b-1:0'
  };

  // Add conditional parameters
  if (storyType === 'visual') {
    requestBody.panels = panels;
  } else if (storyType === 'audio') {
    requestBody.audio_length = audioLength;
  }

  try {
    const topicApiBase = 'https://a3aflxx1o2.execute-api.us-east-1.amazonaws.com/dev';
    const response = await fetch(`${topicApiBase}/generate-story-outline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error('Story outline generation failed');
    }

    // Transform API response to frontend format
    // API returns: { success, route, result: { speaker_names, story_parts, metadata } }
    const { result } = data;

    // Map story_parts to section format expected by frontend
    const outlines = {};
    result.story_parts.forEach(part => {
      outlines[part.story_part] = {
        summary: part.story_part_summary,
        speakers: part.story_part_speakers
      };
    });

    return {
      outlines,
      speakerNames: result.speaker_names,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Failed to generate story outline:', error);
    throw error;
  }
};

/**
 * Generate complete story using Michael's API
 * @param {Object} params - Story generation parameters
 * @param {string} idToken - Cognito ID token
 * @returns {Promise<Object>} Complete story with sections
 */
export const generateCompleteStory = async (params, idToken) => {
  const {
    title,
    storyParams,
    outlines,
    jobId
  } = params;

  // Map reading level from length
  const lengthToReadingLevel = {
    'short': 'elementary',
    'medium': 'middle school',
    'long': 'high school'
  };
  const readingLevel = lengthToReadingLevel[storyParams.length] || 'middle school';

  // Transform outlines to story_outline_description format
  const storyOutlineDescription = Object.entries(outlines).map(([partKey, partData]) => ({
    story_part: partKey,
    story_part_summary: partData.summary,
    story_part_speakers: partData.speakers || ['Narrator']
  }));

  const requestBody = {
    genre: storyParams.genre || 'fiction',
    reading_level: readingLevel,
    tone: storyParams.tone || 'engaging',
    story_outline_description: storyOutlineDescription,
    story_type: storyParams.storyType || 'visual',
    number_of_speakers: storyParams.numberOfSpeakers || 2,
    job_id: jobId,
    model_id: 'bedrock/openai.gpt-oss-120b-1:0'
  };

  // Add conditional parameters
  if (storyParams.storyType === 'visual') {
    requestBody.panels = storyParams.panels || 6;
  }
  if (storyParams.storyType === 'audio' || storyParams.audioLength) {
    requestBody.audio_length = storyParams.audioLength || 5;
  }

  try {
    const response = await fetch(`${MICHAEL_API_BASE}/generate-story`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error('Story generation failed');
    }

    // Transform API response to frontend format
    // API returns: { success, route, result: { story_parts, speaker_names, metadata } }
    const { result } = data;

    // Transform sections and segments for frontend
    console.log('Processing story_parts:', result.story_parts);

    // Group story_parts by story_part name (beginning/middle/end)
    // Multiple story_parts can have the same name when there are many panels
    // Filter out parts without story_part field or with metadata
    const groupedParts = {};
    let currentPart = null;
    
    result.story_parts.forEach(storyPart => {
      // Skip metadata sections
      if (storyPart.story_part === 'metadata') {
        return;
      }
      
      // If this part has a story_part field, use it as current
      if (storyPart.story_part) {
        currentPart = storyPart.story_part;
      }
      
      // Use currentPart or skip if we haven't seen a valid part yet
      if (currentPart) {
        if (!groupedParts[currentPart]) {
          groupedParts[currentPart] = [];
        }
        groupedParts[currentPart].push(storyPart);
      }
    });

    console.log('Grouped story parts:', groupedParts);

    // Create one section per story_part name, combining all segments
    const sections = Object.entries(groupedParts).map(([partName, parts]) => {
      // Flatten all segments from all sections of all parts with this name
      const allSegments = parts.flatMap(part =>
        part.sections?.flatMap(section => section.segments || []) || []
      ).filter(seg => seg.segment_content && seg.segment_content.trim());

      console.log('Total segments for', partName, ':', allSegments.length);

      // Calculate total word count
      const totalWords = allSegments.reduce((sum, seg) => {
        return sum + seg.segment_content.split(/\s+/).length;
      }, 0);

      return {
        id: partName,
        title: partName.charAt(0).toUpperCase() + partName.slice(1),
        segments: allSegments.map(seg => ({
          speaker: seg.speaker,
          content: seg.segment_content
        })),
        word_count: totalWords
      };
    });

    console.log('Transformed sections:', sections);

    return {
      story_id: result.metadata.job_id,
      title: title,
      sections: sections,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Failed to generate complete story:', error);
    throw error;
  }
};

/**
 * Regenerate a specific story segment
 * @param {Object} params - Regeneration parameters
 * @param {string} idToken - Cognito ID token
 * @returns {Promise<Object>} Regenerated segment
 */
export const regenerateSegment = async (params, idToken) => {
  const {
    userId,
    jobId,
    userRequest,
    originalStorySegments,
    originalStorySegmentNum,
    originalStorySegment,
    genre,
    readingLevel,
    tone,
    storyType,
    numberOfSpeakers,
    panels,
    audioLength
  } = params;

  const requestBody = {
    user_id: userId,
    job_id: jobId,
    user_request: userRequest,
    original_story_segments: originalStorySegments,
    original_story_segment_num: originalStorySegmentNum,
    original_story_segment: originalStorySegment,
    genre,
    reading_level: readingLevel,
    tone,
    story_type: storyType,
    number_of_speakers: numberOfSpeakers,
    model_id: 'bedrock/openai.gpt-oss-120b-1:0'
  };

  // Add conditional parameters
  if (storyType === 'visual') {
    requestBody.panels = panels;
  } else if (storyType === 'audio') {
    requestBody.audio_length = audioLength;
  }

  try {
    const response = await fetch(`${MICHAEL_API_BASE}/regenerate-segment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error('Segment regeneration failed');
    }

    return data.result.new_story_segment;
  } catch (error) {
    console.error('Failed to regenerate segment:', error);
    throw error;
  }
};

/**
 * Generate topic ideas
 * @param {Object} params - Topic parameters
 * @param {string} idToken - Cognito ID token
 * @returns {Promise<Object>} Topic ideas and creative direction
 */
export const generateTopicIdeas = async (params, idToken) => {
  const { genre, topics } = params;

  // Ensure all required parameters are present
  if (!genre || !topics) {
    throw new Error('Missing required parameters: genre and topics are required');
  }

  const requestBody = {
    genre: genre,
    topics: topics,
    model_id: 'bedrock/openai.gpt-oss-120b-1:0',
    job_id: `topic-job-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
  };

  console.log('Generating topic ideas with params:', requestBody);

  try {
    // Note: This endpoint uses a different base URL
    const topicApiBase = 'https://a3aflxx1o2.execute-api.us-east-1.amazonaws.com/dev';

    const response = await fetch(`${topicApiBase}/generate-topics-ideas`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API error response:', errorData);
      throw new Error(errorData.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Topic ideas API response:', data);

    if (!data.success) {
      throw new Error('Topic ideas generation failed');
    }

    return data.result;
  } catch (error) {
    console.error('Failed to generate topic ideas:', error);
    console.error('Error details:', error.message);
    throw error;
  }
};

/**
 * Generate story images from complete story segments
 * @param {Object} params - Image generation parameters
 * @param {string} idToken - Cognito ID token
 * @returns {Promise<Object>} Story segments with image URLs
 */
export const generateStoryImages = async (params, idToken) => {
  const {
    completeStoryParts,
    artStyle = 'whimsical watercolor illustration',
    numberOfPanels,
    jobId
  } = params;

  const requestBody = {
    complete_story_parts: completeStoryParts,
    art_style: artStyle,
    number_of_panels: numberOfPanels,
    job_id: jobId
  };

  console.log('📤 Generating story images...');
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(`${MICHAEL_API_BASE}/generate-story-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📥 Image generation response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Image generation failed:', errorData);
      throw new Error(`Image generation failed: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('✅ Image generation successful');
    console.log('Full response:', data);

    // Extract story segments with images
    if (data.result && data.result.story_segments) {
      const segments = data.result.story_segments;
      console.log(`🖼️  Generated ${segments.length} images`);
      
      // Log image details
      segments.forEach(segment => {
        console.log(`  Section ${segment.story_segment_number}: ${segment.image_s3_url}`);
      });

      return {
        segments: segments,
        metadata: data.result.metadata || {}
      };
    } else {
      console.warn('⚠️  Unexpected response format:', data);
      return { segments: [], metadata: {} };
    }
  } catch (error) {
    console.error('Failed to generate story images:', error);
    console.error('Error details:', error.message);
    throw error;
  }
};

/**
 * Generate a unique job ID
 * @returns {string} Unique job ID
 */
export const generateJobId = () => {
  return `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export default {
  generateStoryOutline,
  generateCompleteStory,
  regenerateSegment,
  generateTopicIdeas,
  generateStoryImages,
  generateJobId
};
